// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import Button from 'antd/lib/button';
import Empty from 'antd/lib/empty';
import Spin from 'antd/lib/spin';
import { useDroppable } from '@dnd-kit/core';
import {
    SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Job } from 'cvat-core-wrapper';
import { JobBoardLane, JobBoardLaneState } from 'reducers';

import BoardCard from './board-card';

interface SortableCardProps {
    lane: JobBoardLane;
    job: Job;
    canDrag: boolean;
    pending: boolean;
    onOpen(job: Job, event: React.MouseEvent): void;
}

function SortableBoardCard(props: Readonly<SortableCardProps>): JSX.Element {
    const {
        lane, job, canDrag, pending, onOpen,
    } = props;
    const {
        attributes, listeners, setNodeRef, transform, transition, isDragging,
    } = useSortable({
        id: `job:${job.id}`,
        data: { lane, jobID: job.id },
        disabled: !canDrag || pending,
    });

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={isDragging ? 'cvat-job-board-card-source' : ''}
        >
            <BoardCard
                job={job}
                canDrag={canDrag}
                pending={pending}
                onOpen={onOpen}
                dragHandleProps={{ ...attributes, ...listeners }}
            />
        </div>
    );
}

interface Props {
    lane: JobBoardLane;
    title: string;
    data: JobBoardLaneState;
    isDropTarget: boolean;
    canDrag(job: Job): boolean;
    isTransitioning(job: Job): boolean;
    onOpen(job: Job, event: React.MouseEvent): void;
    onLoadMore(): void;
}

function BoardColumn(props: Readonly<Props>): JSX.Element {
    const {
        lane, title, data, isDropTarget, canDrag, isTransitioning, onOpen, onLoadMore,
    } = props;
    const { setNodeRef, isOver } = useDroppable({ id: `lane:${lane}`, data: { lane } });
    const hasMore = data.jobs.length < data.count;

    return (
        <section className={`cvat-job-board-column${isOver || isDropTarget ? ' cvat-job-board-column-drop-target' : ''}`}>
            <header>
                <span>{title}</span>
                <span className='cvat-job-board-column-count'>{data.count}</span>
            </header>
            <div ref={setNodeRef} className='cvat-job-board-column-content'>
                <SortableContext items={data.jobs.map((job) => `job:${job.id}`)} strategy={verticalListSortingStrategy}>
                    {data.jobs.map((job) => (
                        <SortableBoardCard
                            key={job.id}
                            lane={lane}
                            job={job}
                            canDrag={canDrag(job)}
                            pending={isTransitioning(job)}
                            onOpen={onOpen}
                        />
                    ))}
                </SortableContext>
                {!data.fetching && !data.jobs.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : null}
                {data.fetching ? <Spin className='cvat-job-board-column-spinner' /> : null}
            </div>
            {hasMore ? (
                <Button type='link' disabled={data.fetching} onClick={onLoadMore}>Load more</Button>
            ) : null}
        </section>
    );
}

export default React.memo(BoardColumn);
