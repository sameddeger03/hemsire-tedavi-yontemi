function compareTr(left, right) {
  return String(left || '').localeCompare(String(right || ''), 'tr-TR', {
    sensitivity: 'base',
    numeric: true
  })
}
function timeToMinutes(value) {
  const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return Number.MAX_SAFE_INTEGER
  return Number(match[1]) * 60 + Number(match[2])
}

function relativeTime(time, shiftStart) {
  const minutes = timeToMinutes(time)
  const start = timeToMinutes(shiftStart)
  if (minutes === Number.MAX_SAFE_INTEGER) return minutes
  if (start === Number.MAX_SAFE_INTEGER) return minutes
  return (minutes - start + 24 * 60) % (24 * 60)
}

export function sortTreatmentLabelJobs(jobs, options = {}) {
  const sortBy = options.sortBy === 'time' ? 'time' : 'name'
  const mixPatients = Boolean(options.mixPatients)
  const groupByRoute = Boolean(options.groupByRoute)
  const routeOrder = new Map((options.routeOrder || []).map((route, index) => [route, index]))

  const compareRoutes = (left, right) => {
    const leftOrder = routeOrder.has(left.route) ? routeOrder.get(left.route) : Number.MAX_SAFE_INTEGER
    const rightOrder = routeOrder.has(right.route) ? routeOrder.get(right.route) : Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder || compareTr(left.route, right.route)
  }

  return (Array.isArray(jobs) ? jobs : [])
    .map((job, index) => ({ ...job, _originalOrder: index }))
    .sort((left, right) => {
      if (!mixPatients) {
        const patientDifference = (left.patientOrder ?? 0) - (right.patientOrder ?? 0)
        if (patientDifference) return patientDifference
      }

      if (groupByRoute) {
        const routeDifference = compareRoutes(left, right)
        if (routeDifference) return routeDifference
      }

      const nameDifference = compareTr(left.displayName, right.displayName)
      const timeDifference = relativeTime(left.time, options.shiftStart) - relativeTime(right.time, options.shiftStart)
      if (sortBy === 'time') {
        if (timeDifference) return timeDifference
        if (nameDifference) return nameDifference
      } else {
        if (nameDifference) return nameDifference
        if (timeDifference) return timeDifference
      }

      const patientNameDifference = compareTr(left.patientName, right.patientName)
      if (patientNameDifference) return patientNameDifference
      return left._originalOrder - right._originalOrder
    })
    .map(({ _originalOrder, ...job }) => job)
}
