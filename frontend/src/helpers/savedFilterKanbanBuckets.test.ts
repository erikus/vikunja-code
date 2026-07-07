import {describe, expect, it} from 'vitest'

import {
	getSavedFilterTaskSourceBucket,
	groupTasksBySavedFilterSourceBucket,
} from './savedFilterKanbanBuckets'

import type {IBucket} from '@/modelTypes/IBucket'
import type {IProjectView} from '@/modelTypes/IProjectView'
import type {ITask} from '@/modelTypes/ITask'

function makeView(id: number, projectId: number, position = 1): IProjectView {
	return {
		id,
		projectId,
		viewKind: 'kanban',
		bucketConfigurationMode: 'manual',
		position,
	} as IProjectView
}

function makeBucket(id: number, title: string, projectViewId: number, position = id, tasks: ITask[] = []): IBucket {
	return {
		id,
		title,
		projectViewId,
		position,
		tasks,
		count: tasks.length,
	} as IBucket
}

function makeTask(id: number, projectId: number, buckets: IBucket[] = []): ITask {
	return {
		id,
		projectId,
		buckets,
	} as ITask
}

describe('saved filter kanban buckets', () => {
	it('uses the source project manual kanban bucket when filter buckets are also expanded', () => {
		const sourceBucket = makeBucket(7, 'Doing', 10, 2)
		const filterBucket = makeBucket(99, 'Saved filter backlog', 20, 1)
		const task = makeTask(42, 1, [filterBucket, sourceBucket])

		const bucket = getSavedFilterTaskSourceBucket(task, 20, () => [makeView(10, 1)])

		expect(bucket).toBe(sourceBucket)
	})

	it('groups each task only once when overlapping filter buckets return the same task', () => {
		const sourceBucket = makeBucket(7, 'Doing', 10, 2)
		const task = makeTask(42, 1, [sourceBucket])
		const buckets = [
			makeBucket(1, 'Filter bucket 1', 20, 1, [task]),
			makeBucket(2, 'Filter bucket 2', 20, 2, [task]),
		]

		const grouped = groupTasksBySavedFilterSourceBucket({
			buckets,
			currentViewId: 20,
			projectId: -2,
			noBucketTitle: 'No bucket',
			getProjectViews: () => [makeView(10, 1)],
		})

		expect(grouped).toHaveLength(1)
		expect(grouped[0].title).toBe('Doing')
		expect(grouped[0].tasks.map(t => t.id)).toEqual([42])
		expect(grouped[0].count).toBe(1)
	})

	it('prefers duplicate task entries that include source bucket metadata', () => {
		const sourceBucket = makeBucket(7, 'Doing', 10, 2)
		const taskWithoutBuckets = makeTask(42, 1)
		const taskWithBuckets = makeTask(42, 1, [sourceBucket])
		const buckets = [
			makeBucket(1, 'Filter bucket 1', 20, 1, [taskWithoutBuckets]),
			makeBucket(2, 'Filter bucket 2', 20, 2, [taskWithBuckets]),
		]

		const grouped = groupTasksBySavedFilterSourceBucket({
			buckets,
			currentViewId: 20,
			projectId: -2,
			noBucketTitle: 'No bucket',
			getProjectViews: () => [makeView(10, 1)],
		})

		expect(grouped).toHaveLength(1)
		expect(grouped[0].title).toBe('Doing')
		expect(grouped[0].tasks.map(t => t.id)).toEqual([42])
	})

	it('falls back to the no bucket column only when no non-filter bucket metadata exists', () => {
		const task = makeTask(42, 1, [makeBucket(99, 'Saved filter backlog', 20)])

		const grouped = groupTasksBySavedFilterSourceBucket({
			buckets: [makeBucket(1, 'Filter bucket 1', 20, 1, [task])],
			currentViewId: 20,
			projectId: -2,
			noBucketTitle: 'No bucket',
			getProjectViews: () => [makeView(10, 1)],
		})

		expect(grouped[0].title).toBe('No bucket')
	})
})
