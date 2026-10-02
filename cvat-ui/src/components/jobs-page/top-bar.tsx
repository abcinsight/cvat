// Copyright (C) 2022 Intel Corporation
//
// SPDX-License-Identifier: MIT

import React, { useState } from 'react';
import { Col, Row } from 'antd/lib/grid';
import Input from 'antd/lib/input';
import Radio from 'antd/lib/radio';

import { JobsQuery } from 'reducers';
import dimensions from 'utils/dimensions';
import {
    SortingComponent,
    ResourceFilterHOC,
    defaultVisibility,
    ResourceSelectionInfo,
} from 'components/resource-sorting-filtering';
import JobsCSVExportButton from './jobs-csv-export-button';
import {
    localStorageRecentKeyword, localStorageRecentCapacity, predefinedFilterValues, config,
} from './jobs-filter-configuration';

const FilteringComponent = ResourceFilterHOC(
    config, localStorageRecentKeyword, localStorageRecentCapacity, predefinedFilterValues,
);

interface Props {
    query: JobsQuery;
    onApplyFilter(filter: string | null): void;
    onApplySorting(sorting: string | null): void;
    onApplySearch(search: string | null): void;
    selectedCount: number;
    onSelectAll: () => void;
    view: 'list' | 'board';
    onViewChange(view: 'list' | 'board'): void;
}

function TopBarComponent(props: Readonly<Props>): JSX.Element {
    const {
        query, onApplyFilter, onApplySorting, onApplySearch, selectedCount, onSelectAll, view, onViewChange,
    } = props;
    const [visibility, setVisibility] = useState(defaultVisibility);

    return (
        <Row className='cvat-jobs-page-top-bar' justify='center' align='middle'>
            <Col {...dimensions}>
                <div>
                    <div>
                        <Input.Search
                            enterButton
                            onSearch={(phrase: string) => {
                                onApplySearch(phrase);
                            }}
                            defaultValue={query.search ?? ''}
                            className='cvat-jobs-page-search-bar'
                            placeholder='Search ...'
                        />
                        {view === 'list' ? <ResourceSelectionInfo selectedCount={selectedCount} onSelectAll={onSelectAll} /> : null}
                        <Radio.Group
                            value={view}
                            onChange={(event): void => onViewChange(event.target.value)}
                            optionType='button'
                            buttonStyle='solid'
                        >
                            <Radio.Button value='list'>List</Radio.Button>
                            <Radio.Button value='board'>Board</Radio.Button>
                        </Radio.Group>
                    </div>
                    <div>
                        <SortingComponent
                            visible={visibility.sorting}
                            onVisibleChange={(visible: boolean) => (
                                setVisibility({ ...defaultVisibility, sorting: visible })
                            )}
                            defaultFields={query.sort?.split(',') || ['-ID']}
                            sortingFields={['ID', 'Assignee', 'Updated date', 'Stage', 'State', 'Task ID', 'Project ID', 'Task name', 'Project name']}
                            onApplySorting={onApplySorting}
                        />
                        <FilteringComponent
                            value={query.filter}
                            predefinedVisible={visibility.predefined}
                            builderVisible={visibility.builder}
                            recentVisible={visibility.recent}
                            onPredefinedVisibleChange={(visible: boolean) => (
                                setVisibility({ ...defaultVisibility, predefined: visible })
                            )}
                            onBuilderVisibleChange={(visible: boolean) => (
                                setVisibility({ ...defaultVisibility, builder: visible })
                            )}
                            onRecentVisibleChange={(visible: boolean) => (
                                setVisibility({ ...defaultVisibility, builder: visibility.builder, recent: visible })
                            )}
                            onApplyFilter={onApplyFilter}
                        />
                        <JobsCSVExportButton query={query} />
                    </div>
                </div>
            </Col>
        </Row>
    );
}

export default React.memo(TopBarComponent);
