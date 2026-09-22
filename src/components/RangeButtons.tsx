/** 时间范围按钮组（轨迹管理 / 足迹管理共用；选项由各页传入，key 与后端返回的档位同名） */
export default function RangeButtons<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {options.map((r) => (
        <div
          key={r.key}
          onClick={() => onChange(r.key)}
          style={{
            padding: '4px 14px',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
            background: value === r.key ? '#0052d9' : 'var(--td-bg-color-secondarycontainer, #f2f3f5)',
            color: value === r.key ? '#fff' : 'var(--td-text-color-secondary, #4e5969)',
          }}
        >
          {r.label}
        </div>
      ))}
    </div>
  );
}
