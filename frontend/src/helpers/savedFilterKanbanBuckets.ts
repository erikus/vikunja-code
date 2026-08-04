import {PROJECT_VIEW_KINDS, type IProjectView} from '@/modelTypes/IProjectView'
import type {IBucket} from '@/modelTypes/IBucket'
import type {ITask} from '@/modelTypes/ITask'

export type SavedFilterSourceView = Pick<IProjectView, 'id' | 'viewKind' | 'bucketConfigurationMode' | 'position'>
export type ProjectViewsByProject = (projectId: ITask['projectId']) => readonly SavedFilterSourceView[] | undefined

export function getSavedFilterTaskSourceBucket(
	task: ITask,
	currentViewId: IProjectView['id'],
	getProjectViews: ProjectViewsByProject,
): IBucket | null {
	const candidates = (task.buckets ?? []).filter(b => b.projectViewId !== currentViewId)
	if (candidates.length === 0) {
		return null
	}

	const kanbanView = getProjectViews(task.projectId)
		?.filter(v => v.viewKind === PROJECT_VIEW_KINDS.KANBAN && v.bucketConfigurationMode === 'manual')
		.sort((a, b) => a.position - b.position)[0]

	return candidates.find(b => b.projectViewId === kanbanView?.id) ?? candidates[0]
}

export function groupTasksBySavedFilterSourceBucket({
	buckets,
	currentViewId,
	projectId,
	noBucketTitle,
	getProjectViews,
}: {
	buckets: IBucket[],
	currentViewId: IProjectView['id'],
	projectId: number,
	noBucketTitle: string,
	getProjectViews: ProjectViewsByProject,
}): IBucket[] {
	const columns = new Map<string, {bucket: IBucket, minPosition: number}>()
	const taskColumns = new Map<ITask['id'], {title: string, hasSource: boolean}>()

	function addTaskToColumn(task: ITask, title: string, position: number) {
		const existing = columns.get(title)
		if (existing === undefined) {
			columns.set(title, {
				minPosition: position,
				bucket: {
					id: 0,
					title,
					projectId,
					projectViewId: currentViewId,
					limit: 0,
					tasks: [task],
					count: 1,
					position: 0,
					createdBy: null,
					created: null,
					updated: null,
					maxPermission: null,
				} as unknown as IBucket,
			})
			return
		}

		existing.bucket.tasks.push(task)
		existing.bucket.count++
		existing.minPosition = Math.min(existing.minPosition, position)
	}

	for (const realBucket of buckets) {
		for (const task of realBucket.tasks) {
			const source = getSavedFilterTaskSourceBucket(task, currentViewId, getProjectViews)
			const title = source?.title ?? noBucketTitle
			const position = source?.position ?? Number.MAX_SAFE_INTEGER
			const hasSource = source !== null
			const existingTaskColumn = taskColumns.get(task.id)

			if (existingTaskColumn !== undefined) {
				if (existingTaskColumn.hasSource || !hasSource) {
					continue
				}

				const existingColumn = columns.get(existingTaskColumn.title)
				if (existingColumn !== undefined) {
					existingColumn.bucket.tasks = existingColumn.bucket.tasks.filter(t => t.id !== task.id)
					existingColumn.bucket.count--
				}
			}

			addTaskToColumn(task, title, position)
			taskColumns.set(task.id, {title, hasSource})
		}
	}

	for (const [title, column] of columns) {
		if (column.bucket.count === 0) {
			columns.delete(title)
		}
	}

	return [...columns.values()]
		.sort((a, b) => {
			if (a.minPosition !== b.minPosition) {
				return a.minPosition - b.minPosition
			}

			if (a.bucket.title === noBucketTitle && b.bucket.title !== noBucketTitle) {
				return 1
			}

			if (b.bucket.title === noBucketTitle && a.bucket.title !== noBucketTitle) {
				return -1
			}

			return a.bucket.title.localeCompare(b.bucket.title)
		})
		// Regrouping interleaves tasks from multiple filter buckets, losing the
		// backend's per-bucket priority order — restore it (stable, so ties keep
		// their loaded order).
		.map(({bucket}, index) => ({
			...bucket,
			id: index + 1,
			tasks: [...bucket.tasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
		}))
}
