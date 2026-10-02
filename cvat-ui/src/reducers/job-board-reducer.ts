// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { AnyAction } from 'redux';

import { JobBoardActionTypes } from 'actions/job-board-actions';
import { Job } from 'cvat-core-wrapper';
import { JobBoardLane, JobBoardLaneState, JobBoardState } from '.';

const lanes: JobBoardLane[] = ['new', 'in_progress', 'awaiting_review', 'accepted', 'other'];

function defaultLane(): JobBoardLaneState {
    return {
        jobs: [],
        count: 0,
        page: 0,
        fetching: false,
        fetchingTimestamp: 0,
        error: null,
    };
}

const defaultState: JobBoardState = {
    lanes: lanes.reduce((state, lane) => ({ ...state, [lane]: defaultLane() }), {} as JobBoardState['lanes']),
    transitioning: {},
};

function withLane(
    state: JobBoardState,
    lane: JobBoardLane,
    nextLane: JobBoardLaneState,
): JobBoardState {
    return { ...state, lanes: { ...state.lanes, [lane]: nextLane } };
}

export default function jobBoardReducer(state: JobBoardState = defaultState, action: AnyAction): JobBoardState {
    switch (action.type) {
        case JobBoardActionTypes.GET_LANE: {
            const lane = action.payload.lane as JobBoardLane;
            const { timestamp } = action.payload;
            return withLane(state, lane, {
                ...state.lanes[lane], fetching: true, fetchingTimestamp: timestamp, error: null,
            });
        }
        case JobBoardActionTypes.GET_LANE_SUCCESS: {
            const lane = action.payload.lane as JobBoardLane;
            const { timestamp, count, append } = action.payload;
            const jobs = action.payload.jobs as Job[];
            const current = state.lanes[lane];
            if (current.fetchingTimestamp !== timestamp) return state;
            return withLane(state, lane, {
                ...current,
                jobs: append ? [...current.jobs, ...jobs] : jobs,
                count,
                page: append ? current.page + 1 : 1,
                fetching: false,
            });
        }
        case JobBoardActionTypes.GET_LANE_FAILED: {
            const lane = action.payload.lane as JobBoardLane;
            const { timestamp, error } = action.payload;
            const current = state.lanes[lane];
            if (current.fetchingTimestamp !== timestamp) return state;
            return withLane(state, lane, { ...current, fetching: false, error });
        }
        case JobBoardActionTypes.TRANSITION: {
            const job = action.payload.job as Job;
            const from = action.payload.from as JobBoardLane;
            const to = action.payload.to as JobBoardLane;
            const source = state.lanes[from];
            if (!source.jobs.some((item) => item.id === job.id)) return state;
            const destination = state.lanes[to];
            return {
                ...state,
                lanes: {
                    ...state.lanes,
                    [from]: {
                        ...source,
                        jobs: source.jobs.filter((item) => item.id !== job.id),
                        count: Math.max(0, source.count - 1),
                    },
                    [to]: {
                        ...destination,
                        jobs: [job, ...destination.jobs.filter((item) => item.id !== job.id)],
                        count: destination.count + 1,
                    },
                },
                transitioning: { ...state.transitioning, [job.id]: { from, to } },
            };
        }
        case JobBoardActionTypes.TRANSITION_SUCCESS: {
            const job = action.payload.job as Job;
            const to = action.payload.to as JobBoardLane;
            const destination = state.lanes[to];
            return {
                ...withLane(state, to, {
                    ...destination,
                    jobs: destination.jobs.map((item) => (item.id === job.id ? job : item)),
                }),
                transitioning: Object.fromEntries(
                    Object.entries(state.transitioning).filter(([jobID]) => Number(jobID) !== job.id),
                ),
            };
        }
        case JobBoardActionTypes.TRANSITION_FAILED: {
            const job = action.payload.job as Job;
            const from = action.payload.from as JobBoardLane;
            const to = action.payload.to as JobBoardLane;
            const source = state.lanes[from];
            const destination = state.lanes[to];
            return {
                ...state,
                lanes: {
                    ...state.lanes,
                    [from]: {
                        ...source,
                        jobs: [job, ...source.jobs.filter((item) => item.id !== job.id)],
                        count: source.count + 1,
                    },
                    [to]: {
                        ...destination,
                        jobs: destination.jobs.filter((item) => item.id !== job.id),
                        count: Math.max(0, destination.count - 1),
                    },
                },
                transitioning: Object.fromEntries(
                    Object.entries(state.transitioning).filter(([jobID]) => Number(jobID) !== job.id),
                ),
            };
        }
        default:
            return state;
    }
}
