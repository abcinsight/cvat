// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';

import { JobBoardLane, JobBoardLaneState } from 'reducers';

interface Props {
    lanes: Record<JobBoardLane, JobBoardLaneState>;
}

const stats: { lane: JobBoardLane | 'total'; label: string; }[] = [
    { lane: 'total', label: 'Total jobs' },
    { lane: 'new', label: 'New' },
    { lane: 'in_progress', label: 'In progress' },
    { lane: 'awaiting_review', label: 'Awaiting review' },
    { lane: 'accepted', label: 'Accepted' },
];

function BoardStats(props: Readonly<Props>): JSX.Element {
    const { lanes } = props;
    const total = Object.values(lanes).reduce((sum, lane) => sum + lane.count, 0);

    return (
        <div className='cvat-job-board-stats' aria-label='Job board summary'>
            {stats.map(({ lane, label }) => (
                <div className='cvat-job-board-stat' key={lane}>
                    <span>{label}</span>
                    <strong>{lane === 'total' ? total : lanes[lane].count}</strong>
                </div>
            ))}
        </div>
    );
}

export default React.memo(BoardStats);
