import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../../logging';
import { en } from '../../i18n/en';

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
}

interface AppErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * The single class component allowed in the codebase (AGENTS.md §18.4):
 * catches unexpected render errors and shows a plain recovery screen.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Names and messages of internal errors are app metadata, not chat
    // content; keep the payload minimal and structured regardless.
    logger.error('react.error_boundary', {
      name: error.name,
      componentStackLines: info.componentStack?.split('\n').length ?? 0,
    });
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      return (
        <main
          className="safe-area bg-surface flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center"
          role="alert"
        >
          <h1 className="text-text text-xl font-bold">{en.errorBoundary.title}</h1>
          <p className="text-text-muted max-w-md">{en.errorBoundary.description}</p>
          <button
            type="button"
            onClick={this.handleReload}
            className="bg-accent text-accent-contrast focus-visible:outline-focus-ring min-h-11 rounded-lg px-5 focus-visible:outline-2"
          >
            {en.errorBoundary.reloadButton}
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
