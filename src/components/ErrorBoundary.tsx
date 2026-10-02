import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Component, type ReactNode } from 'react'

/**
 * Se uma tela quebrar, mostra um aviso no lugar dela em vez de deixar o app
 * inteiro em branco. O menu continua funcionando para ir a outra tela.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(previous: { resetKey?: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="empty-state">
        <span className="empty-icon"><AlertTriangle size={26} /></span>
        <h3>Esta tela encontrou um problema</h3>
        <p>Os dados estão seguros. Recarregue a página ou volte para outra tela pelo menu.</p>
        <button className="button button-primary" onClick={() => window.location.reload()}><RotateCcw size={17} /> Recarregar</button>
        <small className="field-hint" style={{ marginTop: 12 }}>{this.state.error.message}</small>
      </div>
    )
  }
}
