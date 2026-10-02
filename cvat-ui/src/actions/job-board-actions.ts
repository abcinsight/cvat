// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import {
    ActionUnion, createAction, ThunkAction,
} from 'utils/redux';
import { getCore, Job } from 'cvat-core-wrapper';
import { BoardJobsQuery, JobBoardLane } from 'reducers';
import { filterNull } from 'utils/filter-null';

const cvat = getCore();

export enum JobBoardActionTypes {
    GET_LANE = 'GET_JOB_BOARD_LANE',
    GET_LANE_SUCCESS = 'GET_JOB_BOARD_LANE_SUCCESS',
    GET_LANE_FAILED = 'GET_JOB_BOARD_LANE_FAILED',
    TRANSITION = 'TRANSITION_JOB_BOARD_CARD',
    TRANSITION_SUCCESS = 'TRANSITION_JOB_BOARD_CARD_SUCCESS',
    TRANSITION_FAILED = 'TRANSITION_JOB_BOARD_CARD_FAILED',
}

export const jobBoardActions = {
    getLane: (lane: JobBoardLane, timestamp: number, append: boolean) => (
        createAction(JobBoardActionTypes.GET_LANE, { lane, timestamp, append })
    ),
    getLaneSuccess: (lane: JobBoardLane, timestamp: number, jobs: Job[], count: number, append: boolean) => (
        createAction(JobBoardActionTypes.GET_LANE_SUCCESS, {
            lane, timestamp, jobs, count, append,
        })
    ),
    getLaneFailed: (lane: JobBoardLane, timestamp: number, error: unknown) => (
        createAction(JobBoardActionTypes.GET_LANE_FAILED, { lane, timestamp, error })
    ),
    transition: (job: Job, from: JobBoardLane, to: JobBoardLane) => (
        createAction(JobBoardActionTypes.TRANSITION, { job, from, to })
    ),
    transitionSuccess: (job: Job, from: JobBoardLane, to: JobBoardLane) => (
        createAction(JobBoardActionTypes.TRANSITION_SUCCESS, { job, from, to })
    ),
    transitionFailed: (job: Job, from: JobBoardLane, to: JobBoardLane, error: unknown) => (
        createAction(JobBoardActionTypes.TRANSITION_FAILED, {
            job, from, to, error,
        })
    ),
};

export type JobBoardActions = ActionUnion<typeof jobBoardActions>;

export const getJobBoardLaneAsync = (
    lane: JobBoardLane,
    query: BoardJobsQuery,
    append = false,
): ThunkAction => async (dispatch) => {
    const timestamp = Date.now();
    dispatch(jobBoardActions.getLane(lane, timestamp, append));
    try {
        const jobs = await cvat.jobs.getBoard(lane, filterNull(query));
        dispatch(jobBoardActions.getLaneSuccess(lane, timestamp, jobs, jobs.count, append));
    } catch (error) {
        dispatch(jobBoardActions.getLaneFailed(lane, timestamp, error));
    }
};

export const transitionJobBoardCardAsync = (
    job: Job,
    from: JobBoardLane,
    to: JobBoardLane,
    action: 'submit' | 'request_changes' | 'approve' | 'reopen',
): ThunkAction<Promise<void>> => async (dispatch) => {
    dispatch(jobBoardActions.transition(job, from, to));
    try {
        const updated = await job.transition(action);
        dispatch(jobBoardActions.transitionSuccess(updated, from, to));
    } catch (error) {
        dispatch(jobBoardActions.transitionFailed(job, from, to, error));
        throw error;
    }
};
