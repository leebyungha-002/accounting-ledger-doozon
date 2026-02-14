import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                {this.props.fallbackTitle ?? '오류가 발생했습니다'}
              </CardTitle>
              <CardDescription>
                페이지를 불러오는 중 문제가 생겼습니다. 새로고침하거나 처음부터 다시 시도해 주세요.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-32 text-muted-foreground">
                {this.state.error.message}
              </pre>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    this.setState({ hasError: false, error: null });
                    this.props.onReset?.();
                  }}
                >
                  다시 시도
                </Button>
                <Button
                  variant="default"
                  onClick={() => window.location.href = '/'}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  처음으로
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
