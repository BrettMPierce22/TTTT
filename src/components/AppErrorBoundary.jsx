import { Component } from "react";
import tableTalkAppIcon from "../assets/table-talk-app-icon.png";

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Table Talk encountered an unexpected screen error", error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="fatal-error-page" role="alert">
        <img src={tableTalkAppIcon} alt="" />
        <p className="season-label">WE HIT A SNAG</p>
        <h1>Table Talk couldn’t open this screen.</h1>
        <p>
          Your account and league data are still safe. Try reopening the app. If
          the problem continues, contact Table Talk Support.
        </p>
        <div className="fatal-error-actions">
          <button type="button" onClick={() => window.location.reload()}>
            Reopen Table Talk
          </button>
          <a href="https://tabletalktabletennis.com/support/">Open Support</a>
        </div>
      </main>
    );
  }
}

export default AppErrorBoundary;
