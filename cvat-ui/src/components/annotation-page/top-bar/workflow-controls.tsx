// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import Button from 'antd/lib/button';
import message from 'antd/lib/message';
import { Job, JobStage, JobType } from 'cvat-core-wrapper';
import { CombinedState } from 'reducers';
import { finishCurrentJobAsync, saveAnnotationsAsync } from 'actions/annotation-actions';
import CVATTooltip from 'components/common/cvat-tooltip';

export default function WorkflowControls(): JSX.Element | null {
    const dispatch = useDispatch();
    const history = useHistory();
    const job = useSelector((state: CombinedState) => state.annotation.job.instance as Job);
    const issues = useSelector((state: CombinedState) => state.review.issues);
    const [busy, setBusy] = useState(false);
    if (!job.validator || job.type !== JobType.ANNOTATION || job.parentJobId || job.replicasCount) return null;
    const unresolved = issues.filter((issue) => !issue.resolved).length;
    const transition = async (action: Parameters<Job['transition']>[0]): Promise<void> => {
        setBusy(true);
        try {
            if (action === 'submit') {
                await dispatch(finishCurrentJobAsync(() => {
                    message.success('Job submitted for review');
                    history.push(`/tasks/${job.taskId}`);
                }));
            } else {
                if (!job.annotationsReadOnly) await dispatch(saveAnnotationsAsync());
                await job.transition(action);
                window.location.reload();
            }
        } catch (error) {
            message.error(`Could not update review: ${error}`);
        } finally {
            setBusy(false);
        }
    };
    return (
        <>
            {job.stage === JobStage.ANNOTATION && job.workflowPermissions.submit && (
                <Button loading={busy} onClick={() => transition('submit')}>Submit for review</Button>
            )}
            {job.stage === JobStage.VALIDATION && job.workflowPermissions.approve && (
                <CVATTooltip title={unresolved ? 'Resolve all issues before approving' : 'Accept this job'}>
                    <span><Button disabled={!!unresolved || busy} onClick={() => transition('approve')}>Approve</Button></span>
                </CVATTooltip>
            )}
            {job.stage === JobStage.VALIDATION && job.workflowPermissions.request_changes && (
                <CVATTooltip title={unresolved ? 'Return to the annotator' : 'Create an unresolved issue first'}>
                    <span><Button disabled={!unresolved || busy} onClick={() => transition('request_changes')}>Request changes</Button></span>
                </CVATTooltip>
            )}
            {job.stage === JobStage.ACCEPTANCE && job.workflowPermissions.reopen && (
                <Button loading={busy} onClick={() => transition('reopen')}>Reopen</Button>
            )}
        </>
    );
}
