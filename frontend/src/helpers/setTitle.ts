export function setTitle(title : undefined | string) {
	document.title = (typeof title === 'undefined' || title === '')
		? 'Swimmy'
		: `${title} | Swimmy`
}
