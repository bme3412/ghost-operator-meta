import { Component, type ReactNode } from 'react'

interface State {
  message: string | null
}

/**
 * Last-resort boundary around the panel views: a render crash shows a
 * readable message instead of a blank window. Reloading the panel clears it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  render(): ReactNode {
    if (this.state.message !== null) {
      return (
        <p className="alert-error" role="alert">
          Something went wrong showing this view: {this.state.message}
        </p>
      )
    }
    return this.props.children
  }
}
