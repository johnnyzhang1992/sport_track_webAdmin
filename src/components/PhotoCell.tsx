import { useState } from 'react'
import { Button, ImageViewer, MessagePlugin } from 'tdesign-react'

/** 列表行里与图片有关的三个字段（轨迹 / 足迹同形态，后端两个列表口径一致） */
export interface PhotoRow {
  id: string
  photoCount: number
  coverPhoto: string
}

/**
 * 列表「图片」列：36px 缩略图 + 张数 + 预览。
 * 整组照片按行懒取（列表只下发签名首图，一页 100 行 × 多图会白烧签名），
 * 取回后交给 ImageViewer 全屏看。
 */
export default function PhotoCell({
  row,
  load,
}: {
  row: PhotoRow
  load: (id: string) => Promise<string[]>
}) {
  const [urls, setUrls] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  // 库里有照片记录但 OSS 对象已不存在（历史脏数据 / 上传未完成就落库）→ 缩略图位要说明原因，不能留个裂图
  const [thumbFailed, setThumbFailed] = useState(false)
  // 表格排序/翻页会复用同一个组件实例：换行了就把缩略图失败态清掉，否则上一行的裂图占位会跟着跑
  const [prevCover, setPrevCover] = useState(row.coverPhoto)
  if (prevCover !== row.coverPhoto) {
    setPrevCover(row.coverPhoto)
    setThumbFailed(false)
  }

  if (!row.photoCount) {
    return <span style={{ color: 'var(--td-text-color-placeholder, #bbb)' }}>—</span>
  }

  const open = async () => {
    if (busy) return
    setBusy(true)
    try {
      const list = await load(row.id)
      if (list.length === 0) {
        MessagePlugin.warning(`这条记录标称 ${row.photoCount} 张照片，详情接口一个地址都没返回`)
        return
      }
      setUrls(list)
    } catch (e) {
      MessagePlugin.error(`照片加载失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {row.coverPhoto &&
        (thumbFailed ? (
          <span
            title="缩略图取不到：OSS 上这个对象已不存在（历史数据），点预览可看到具体是哪几张"
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              flex: 'none',
              border: '1px dashed var(--td-border-level-2-color, #dcdcdc)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              color: 'var(--td-text-color-placeholder, #bbb)',
              cursor: 'pointer',
            }}
            onClick={open}
          >
            缺图
          </span>
        ) : (
          <img
            src={row.coverPhoto}
            onClick={open}
            onError={() => setThumbFailed(true)}
            title="点击看大图"
            style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', cursor: 'pointer', flex: 'none' }}
          />
        ))}
      <span style={{ whiteSpace: 'nowrap' }}>{row.photoCount} 张</span>
      <Button size="small" variant="text" loading={busy} onClick={open}>
        预览
      </Button>
      {urls && (
        <ImageViewer
          visible
          images={urls}
          title={`共 ${urls.length} 张`}
          onClose={() => setUrls(null)}
        />
      )}
    </div>
  )
}
