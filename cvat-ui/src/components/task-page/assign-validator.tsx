// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT
import React, { useState } from 'react';
import Button from 'antd/lib/button';
import Modal from 'antd/lib/modal';
import Checkbox from 'antd/lib/checkbox';
import message from 'antd/lib/message';
import { Task, User } from 'cvat-core-wrapper';
import UserSelector from './user-selector';

export default function AssignValidator({ task }: { task: Task }): JSX.Element {
    const [open, setOpen] = useState(false);
    const [validator, setValidator] = useState<User | null>(task.defaultValidator);
    const [overwrite, setOverwrite] = useState(false);
    const [busy, setBusy] = useState(false);
    return (
        <>
            <Button onClick={() => setOpen(true)}>Assign validator to jobs</Button>
            <Modal
                open={open}
                title='Default validator'
                confirmLoading={busy}
                onCancel={() => setOpen(false)}
                onOk={async () => {
                    setBusy(true);
                    try {
                        await task.assignValidator(validator, overwrite);
                        window.location.reload();
                    } catch (error) {
                        message.error(`Could not assign validator: ${error}`);
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <p>
                    Apply to jobs without a validator and use for future jobs.
                    Clear the selection to remove the default.
                </p>
                <UserSelector value={validator} onSelect={setValidator} />
                <Checkbox checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)}>
                    Replace the validator on all annotation jobs
                </Checkbox>
            </Modal>
        </>
    );
}
