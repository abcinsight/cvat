// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import Card from 'antd/lib/card';
import Avatar from 'antd/lib/avatar';
import Badge from 'antd/lib/badge';
import Tag from 'antd/lib/tag';
import { HolderOutlined, UserOutlined } from '@ant-design/icons';

import { Job } from 'cvat-core-wrapper';
import CVATTooltip from 'components/common/cvat-tooltip';
import Preview from 'components/common/preview';

interface Props {
    job: Job;
    canDrag: boolean;
    pending: boolean;
    dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
    onOpen(job: Job, event: React.MouseEvent): void;
}

function BoardCard(props: Readonly<Props>): JSX.Element {
    const {
        job, canDrag, pending, onOpen, dragHandleProps,
    } = props;
    const changesRequested = job.reviewRound > 0 && job.stage === 'annotation' && job.state === 'in progress';
    const dragTooltip = canDrag ? 'Drag to a permitted workflow lane' : 'You cannot transition this job';

    return (
        <Card
            size='small'
            className={`cvat-job-board-card${pending ? ' cvat-job-board-card-pending' : ''}`}
            hoverable={!pending}
            onClick={(event): void => onOpen(job, event)}
        >
            <div className='cvat-job-board-card-header'>
                <CVATTooltip overlay={dragTooltip}>
                    <button
                        type='button'
                        aria-label={dragTooltip}
                        className={`cvat-job-board-card-drag-handle${canDrag && !pending ? '' : ' cvat-job-board-card-drag-disabled'}`}
                        onClick={(event): void => event.stopPropagation()}
                        {...dragHandleProps}
                    >
                        <HolderOutlined />
                    </button>
                </CVATTooltip>
                <span>{`Job #${job.id}`}</span>
                <Tag>{`${job.stage} / ${job.state}`}</Tag>
            </div>
            <div className='cvat-job-board-card-preview'>
                <Preview
                    job={job}
                    loadingClassName='cvat-job-board-preview-loading'
                    emptyPreviewClassName='cvat-job-board-preview-empty'
                    previewWrapperClassName='cvat-job-board-preview-wrapper'
                    previewClassName='cvat-job-board-preview'
                />
            </div>
            <div className='cvat-job-board-card-task'>{job.taskName}</div>
            {job.projectName ? <div className='cvat-job-board-card-project'>{job.projectName}</div> : null}
            <div className='cvat-job-board-card-details'>
                <span>{`Frames: ${job.stopFrame - job.startFrame + 1}`}</span>
                <span className='cvat-job-board-card-user'>
                    <Avatar size='small' icon={<UserOutlined />} />
                    {job.assignee?.username || 'Unassigned'}
                </span>
            </div>
            <div className='cvat-job-board-card-tags'>
                {job.validator ? <Tag color='purple'>{`Validator: ${job.validator.username}`}</Tag> : null}
                {changesRequested ? <Tag color='volcano'>Changes requested</Tag> : null}
                {job.reviewRound ? <Tag>{`Round ${job.reviewRound}`}</Tag> : null}
                {job.issuesCount ? <Badge count={`${job.issuesCount} issues`} /> : null}
            </div>
        </Card>
    );
}

export default BoardCard;
