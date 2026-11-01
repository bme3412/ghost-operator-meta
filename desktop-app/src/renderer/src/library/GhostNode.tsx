import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'

export interface GhostNodeData {
  title: string
  subtitle?: string
  [key: string]: unknown
}

export type GhostFlowNode = Node<GhostNodeData, 'ghost'>

/**
 * The one map node face: a plain-language title and one muted subtitle.
 * Selectors, raw check names, and binding paths never render here — those
 * live in the Library detail panes, not on the demo-facing canvas.
 */
export function GhostNode({ data }: NodeProps<GhostFlowNode>): React.JSX.Element {
  return (
    <div className="ghost-node">
      <Handle type="target" position={Position.Top} className="ghost-node-handle" />
      <div className="ghost-node-title">{data.title}</div>
      {data.subtitle && <div className="ghost-node-sub">{data.subtitle}</div>}
      <Handle type="source" position={Position.Bottom} className="ghost-node-handle" />
    </div>
  )
}

export const ghostNodeTypes = { ghost: GhostNode }
