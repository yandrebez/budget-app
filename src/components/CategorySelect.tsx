import type { Category, Group } from '@/types'

/** Category dropdown grouped by group. `value` of '' means uncategorised. */
export function CategorySelect({ value, onChange, groups, categories, id }: {
  value: string; onChange: (id: string) => void; groups: Group[]; categories: Category[]; id?: string
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Uncategorised</option>
      {groups.map((g) => {
        const cs = categories.filter((c) => c.groupId === g.id)
        return cs.length ? (
          <optgroup key={g.id} label={g.name}>{cs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
        ) : null
      })}
    </select>
  )
}
