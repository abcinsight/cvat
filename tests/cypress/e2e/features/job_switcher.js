// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

context('Annotation job switcher', () => {
    let taskID;
    let jobs;
    const switcher = '.cvat-annotation-job-switcher';

    function selectJob(id) {
        cy.get(switcher).click();
        cy.get(`${switcher} input`).type(String(id));
        cy.contains('.ant-select-item-option', `Job #${id} ·`).click();
    }

    function assertJob(job) {
        cy.location('pathname').should('eq', `/tasks/${taskID}/jobs/${job.id}`);
        cy.get('.cvat-canvas-container').should('be.visible');
        cy.get(`${switcher} .ant-select-selection-item`).should('have.text', `Job #${job.id}`);
        cy.get('.cvat-player-frame-selector input').should('have.value', String(job.start_frame));
    }

    before(() => {
        cy.visit('/auth/login');
        cy.login();
        cy.headlessCreateTask({
            name: 'Annotation job switcher',
            labels: [{ name: 'label 1', attributes: [], type: 'any' }],
            segment_size: 5,
            overlap: 0,
        }, {
            server_files: ['archive.zip'],
            image_quality: 70,
            use_zip_chunks: true,
        }).then((result) => {
            taskID = result.taskID;
            cy.request(`/api/jobs?task_id=${taskID}`).then(({ body }) => {
                jobs = body.results.sort((a, b) => a.start_frame - b.start_frame);
                expect(jobs.length).to.be.greaterThan(1);
            });
        });
    });

    after(() => {
        cy.visit('/tasks');
        cy.headlessDeleteTask(taskID);
    });

    beforeEach(() => {
        cy.visit(`/tasks/${taskID}/jobs/${jobs[0].id}`);
        assertJob(jobs[0]);
    });

    it('Switches jobs and supports browser Back and Forward', () => {
        selectJob(jobs[1].id);
        assertJob(jobs[1]);
        cy.go('back');
        assertJob(jobs[0]);
        cy.go('forward');
        assertJob(jobs[1]);
    });

    it('Keeps unsaved annotations when switching is canceled, and discards them on confirmation', () => {
        cy.createRectangle({
            points: 'By 2 Points',
            type: 'Shape',
            labelName: 'label 1',
            firstX: 250,
            firstY: 250,
            secondX: 350,
            secondY: 350,
        });
        cy.window().then((win) => cy.stub(win, 'confirm').returns(false).as('leaveJob'));
        selectJob(jobs[1].id);
        cy.get('@leaveJob').should('have.been.calledOnce');
        assertJob(jobs[0]);
        cy.get('.cvat_canvas_shape').should('have.length', 1);
        cy.get('@leaveJob').invoke('returns', true);
        selectJob(jobs[1].id);
        assertJob(jobs[1]);
        cy.get('.cvat_canvas_shape').should('not.exist');
        cy.go('back');
        assertJob(jobs[0]);
        cy.get('.cvat_canvas_shape').should('not.exist');
    });

    it('Loads additional pages and filters by job ID', () => {
        cy.intercept({ pathname: '/api/jobs', query: { task_id: String(taskID), page_size: '500' } }, (req) => {
            const page = Number(req.query.page);
            req.reply({ count: jobs.length, results: [jobs[page - 1]] });
        }).as('jobPage');
        cy.reload();
        assertJob(jobs[0]);
        selectJob(jobs[jobs.length - 1].id);
        assertJob(jobs[jobs.length - 1]);
    });

    it('Offers retry after a failed job list request', () => {
        cy.intercept({
            pathname: '/api/jobs', query: { task_id: String(taskID), page_size: '500' }, times: 1,
        }, { statusCode: 500 }).as('failedJobs');
        cy.reload();
        cy.wait('@failedJobs');
        cy.get(switcher).click();
        cy.contains('Could not load jobs.').should('be.visible');
        cy.contains('button', 'Retry').click();
        cy.contains('.ant-select-item-option', `Job #${jobs[1].id} ·`).click();
        assertJob(jobs[1]);
    });
});
