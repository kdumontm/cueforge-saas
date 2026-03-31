'use client';
import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — attrape les erreurs React runtime et affiche un fallback
 * au lieu de faire crasher toute la page.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[CueForge][ErrorBoundary] 🔴 ERREUR CAPTURÉE :', error?.message);
    console.error('[CueForge][ErrorBoundary] Stack:', error?.stack);
    console.error('[CueForge][ErrorBoundary] Component stack:', info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
          <div className="text-5xl">🎛️</div>
          <h2 className="text-xl font-semibold text-white">
            Une erreur inattendue s&apos;est produite
          </h2>
          <p className="text-sm text-gray-400 max-w-md">
            {this.state.error?.message || 'Erreur inconnue'}
          </p>
          <button
            onClick={this.handleReload}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            Recharger la page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
