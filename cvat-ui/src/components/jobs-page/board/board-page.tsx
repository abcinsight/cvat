// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import {
    closestCorners, DndContext, DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent,
    KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

import { Job } from 'cvat-core-wrapper';
import { getJobBoardLaneAsync, transitionJobBoardCardAsync } from 'actions/job-board-actions';
import { BoardJobsQuery, CombinedState, JobBoardLane } from 'reducers';

import BoardColumn from './board-column';
import BoardCard from './board-card';
import BoardFilters from './board-filters';
import BoardStats from './board-stats';

const laneDefinitions: { lane: JobBoardLane; title: string; }[] = [
    { lane: 'new', title: 'New' },
    { lane: 'in_progress', title: 'In progress' },
    { lane: 'awaiting_review', title: 'Awaiting review' },
    { lane: 'accepted', title: 'Accepted' },
    { lane: 'other', title: 'Other / legacy' },
];

type WorkflowAction = 'submit' | 'request_changes' | 'approve' | 'reopen';

function getAction(job: Job, from: JobBoardLane, to: JobBoardLane): WorkflowAction | null {
    const permissions = job.workflowPermissions;
    if ((from === 'new' || from === 'in_progress') && to === 'awaiting_review' && permissions.submit) {
        return 'submit';
    }
    if (from === 'awaiting_review' && to === 'in_progress' && permissions.request_changes) {
        return 'request_changes';
    }
    if (from === 'awaiting_review' && to === 'accepted' && permissions.approve) {
        return 'approve';
    }
    if (from === 'accepted' && to === 'in_progress' && permissions.reopen) {
        return 'reopen';
    }
    return null;
}

function laneFromDropTarget(id: string, fallback: JobBoardLane | undefined): JobBoardLane | undefined {
    if (id.startsWith('lane:')) return id.slice('lane:'.length) as JobBoardLane;
    return fallback;
}

interface Props {
    query: BoardJobsQuery;
}

function BoardPage(props: Readonly<Props>): JSX.Element {
    const { query } = props;
    const dispatch = useDispatch();
    const history = useHistory();
    const { lanes, transitioning } = useSelector((state: CombinedState) => state.jobBoard);
    const [activeDragJob, setActiveDragJob] = useState<Job | null>(null);
    const [overLane, setOverLane] = useState<JobBoardLane | null>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const loadLane = useCallback((lane: JobBoardLane, append = false): void => {
        const page = append ? lanes[lane].page + 1 : 1;
        dispatch(getJobBoardLaneAsync(lane, { ...query, page, pageSize: 25 }, append));
    }, [dispatch, lanes, query]);

    useEffect(() => {
        laneDefinitions.forEach(({ lane }) => loadLane(lane));
    }, [query.filter, query.search, query.sort]);

    const onOpen = useCallback((job: Job, event: React.MouseEvent): void => {
        const url = `/tasks/${job.taskId}/jobs/${job.id}`;
        if (event.ctrlKey || event.metaKey) {
            window.open(url, '_blank', 'noopener,noreferrer');
        } else {
            history.push(url);
        }
    }, [history]);

    const onDragStart = useCallback((event: DragStartEvent): void => {
        const lane = event.active.data.current?.lane as JobBoardLane | undefined;
        const jobID = event.active.data.current?.jobID;
        const job = lane ? lanes[lane].jobs.find((item) => item.id === jobID) : null;
        setActiveDragJob(job || null);
        setOverLane(lane || null);
    }, [lanes]);

    const onDragOver = useCallback((event: DragOverEvent): void => {
        if (!event.over) return;
        setOverLane(laneFromDropTarget(
            String(event.over.id), event.over.data.current?.lane as JobBoardLane | undefined,
        ) || null);
    }, []);

    const clearDrag = useCallback((): void => {
        setActiveDragJob(null);
        setOverLane(null);
    }, []);

    const onDragEnd = useCallback(async (event: DragEndEvent): Promise<void> => {
        const { active, over } = event;
        if (!over) {
            clearDrag();
            return;
        }
        const from = active.data.current?.lane as JobBoardLane | undefined;
        const fallback = over.data.current?.lane as JobBoardLane | undefined;
        const to = laneFromDropTarget(String(over.id), fallback);
        const job = from ? lanes[from].jobs.find((item) => item.id === active.data.current?.jobID) : null;
        if (!job || !from || !to || from === to) {
            clearDrag();
            return;
        }
        const action = getAction(job, from, to);
        if (!action) {
            clearDrag();
            return;
        }
        try {
            await dispatch(transitionJobBoardCardAsync(job, from, to, action) as any);
        } catch (_) {
            // The reducer restores the optimistic move and notifications render the API error.
        } finally {
            clearDrag();
        }
    }, [clearDrag, dispatch, lanes]);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragCancel={clearDrag}
            onDragEnd={onDragEnd}
        >
            <div className='cvat-job-board'>
                <BoardStats lanes={lanes} />
                <BoardFilters query={query} />
                <div className='cvat-job-board-lanes'>
                    {laneDefinitions.filter(({ lane }) => (
                        lane !== 'other' || lanes[lane].fetching || lanes[lane].count > 0
                    )).map(({ lane, title }) => (
                        <BoardColumn
                            key={lane}
                            lane={lane}
                            title={title}
                            data={lanes[lane]}
                            isDropTarget={overLane === lane && activeDragJob !== null}
                            canDrag={(job: Job): boolean => laneDefinitions.some(({ lane: destination }) => (
                                getAction(job, lane, destination) !== null
                            ))}
                            isTransitioning={(job: Job): boolean => job.id in transitioning}
                            onOpen={onOpen}
                            onLoadMore={(): void => loadLane(lane, true)}
                        />
                    ))}
                </div>
            </div>
            <DragOverlay dropAnimation={null}>
                {activeDragJob ? (
                    <div className='cvat-job-board-card-overlay'>
                        <BoardCard
                            job={activeDragJob}
                            canDrag={false}
                            pending={false}
                            onOpen={(): void => {}}
                        />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

export default React.memo(BoardPage);
