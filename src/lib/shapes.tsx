export const ANSWER = [
  { key: 'red', label: 'triângulo', path: <path d="M14 3 26 25H2z" /> },
  { key: 'orange', label: 'losango', path: <path d="M14 2 26 14 14 26 2 14z" /> },
  { key: 'yellow', label: 'círculo', path: <circle cx="14" cy="14" r="12" /> },
  { key: 'purple', label: 'quadrado', path: <rect x="3" y="3" width="22" height="22" rx="3" /> },
] as const

export function Shape({ index }: { index: number }) {
  return (
    <svg className="qz-shape" viewBox="0 0 28 28" aria-hidden="true">
      {ANSWER[index].path}
    </svg>
  )
}
