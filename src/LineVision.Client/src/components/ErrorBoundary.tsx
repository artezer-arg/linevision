import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Industrial HMI Uncaught Exception:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0b0d11] text-slate-100 flex items-center justify-center p-6">
          <div className="bg-[#1a1d24] border-2 border-red-500 rounded-2xl max-w-xl w-full p-8 shadow-2xl space-y-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-red-950/80 text-red-400 rounded-xl border border-red-500">
                <ShieldAlert className="w-8 h-8 animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-black text-red-400 tracking-wide uppercase">
                  Excepción en Interfaz HMI DL02
                </h1>
                <p className="text-xs text-slate-400 font-mono">
                  LineVision Industrial Runtime Protection
                </p>
              </div>
            </div>

            <div className="bg-[#121418] border border-slate-800 rounded-xl p-4 font-mono text-xs text-red-300 overflow-x-auto">
              <p className="font-bold mb-1">
                {this.state.error?.name}: {this.state.error?.message}
              </p>
              {this.state.error?.stack && (
                <pre className="text-[10px] text-slate-500 whitespace-pre-wrap">
                  {this.state.error.stack.split('\n').slice(0, 5).join('\n')}
                </pre>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-bold text-white transition"
              >
                Reintentar Render
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-black text-white flex items-center justify-center space-x-2 shadow-lg transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reiniciar HMI</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
