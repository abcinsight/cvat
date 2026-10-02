// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import Select from 'antd/lib/select';
import Button from 'antd/lib/button';
import Spin from 'antd/lib/spin';

import { getCore, Job, JobType } from 'cvat-core-wrapper';

interface Props {
    job: Job;
    disabled: boolean;
}

export default function JobSwitcher({ job, disabled }: Props): JSX.Element {
    const history = useHistory();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setFailed(false);
        setJobs([]);
        if (job.taskId === null) {
            setLoading(false);
            setFailed(true);
            return undefined;
        }

        // Aggregate follows pagination, including tasks with more than one page of jobs.
        getCore().jobs.get({ taskID: job.taskId }, true).then((result) => {
            if (active) {
                setJobs(result.sort((a, b) => a.startFrame - b.startFrame || a.id - b.id));
            }
        }).catch(() => {
            if (active) setFailed(true);
        }).finally(() => {
            if (active) setLoading(false);
        });

        return () => {
            active = false;
        };
    }, [job.taskId, attempt]);

    const options = (loading || failed ? [] : jobs).map((item) => ({
        value: item.id,
        label: `Job #${item.id}`,
        title: [
            `Job #${item.id}`,
            `Frames ${item.startFrame}–${item.stopFrame}`,
            item.stage,
            item.state,
            ...(item.type !== JobType.ANNOTATION ? [item.type.replace(/_/g, ' ')] : []),
        ].join(' · '),
    }));

    return (
        <Select
            className='cvat-annotation-job-switcher'
            aria-label='Switch job'
            showSearch
            value={job.id}
            disabled={disabled}
            loading={loading}
            optionFilterProp='label'
            optionLabelProp='label'
            options={options.length ? options : [{ value: job.id, label: `Job #${job.id}`, title: '' }]}
            optionRender={({ data }) => (
                <span title={data.title}>{data.title || data.label}</span>
            )}
            popupMatchSelectWidth={460}
            notFoundContent={loading ? <Spin size='small' /> : 'No matching jobs'}
            dropdownRender={(menu) => (failed ? (
                <div role='alert' className='cvat-annotation-job-switcher-error'>
                    Could not load jobs.
                    <Button type='link' onClick={() => setAttempt((value) => value + 1)}>Retry</Button>
                </div>
            ) : menu)}
            onChange={(id: number) => {
                if (id !== job.id) {
                    history.push(`/tasks/${job.taskId}/jobs/${id}`);
                }
            }}
        />
    );
}
