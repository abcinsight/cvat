// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import Tag from 'antd/lib/tag';

import { BoardJobsQuery } from 'reducers';

interface Props {
    query: BoardJobsQuery;
}

// The controls themselves live in the shared Jobs top bar. Keeping this
// compact summary in the board makes it clear that the same query applies to
// every lane instead of only the currently visible column.
function BoardFilters(props: Readonly<Props>): JSX.Element {
    const { query } = props;
    const hasFilters = Boolean(query.search || query.filter || query.sort);

    return (
        <div className='cvat-job-board-filters'>
            <span>Board filters:</span>
            {query.search ? <Tag>{`Search: ${query.search}`}</Tag> : null}
            {query.filter ? <Tag>Advanced filter</Tag> : null}
            {query.sort ? <Tag>{`Sort: ${query.sort}`}</Tag> : null}
            {!hasFilters ? <span>All accessible jobs</span> : null}
        </div>
    );
}

export default React.memo(BoardFilters);
