import { useState } from "react";
import { KeysPage } from "./pages/KeysPage";
import { UsageDashboard } from "./pages/UsageDashboard";
import { PermissionsPage } from "./pages/PermissionsPage";
import { VerificationLog } from "./pages/VerificationLog";
import { TryItPage } from "./pages/TryItPage";
import "./App.css";

type Page = "keys" | "usage" | "permissions" | "logs" | "tryit";

const NAV_ITEMS: { id: Page; label: string }[] = [
  { id: "keys", label: "Keys" },
  { id: "usage", label: "Usage" },
  { id: "permissions", label: "Permissions" },
  { id: "logs", label: "Logs" },
  { id: "tryit", label: "Try It" },
];

function App() {
  const [page, setPage] = useState<Page>("keys");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderPage = () => {
    switch (page) {
      case "keys": return <KeysPage />;
      case "usage": return <UsageDashboard />;
      case "permissions": return <PermissionsPage />;
      case "logs": return <VerificationLog />;
      case "tryit": return <TryItPage />;
    }
  };

  return (
    <div className="layout">
      <div className="main-content">
        <div className="top-bar">
          <h1>Convex API Keys</h1>
          <button
            className="menu-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            ☰
          </button>
        </div>
        {renderPage()}
      </div>

      <nav className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <span>Navigation</span>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>
        <ul className="nav-list">
          {NAV_ITEMS.map(item => (
            <li key={item.id}>
              <button
                className={`nav-btn ${page === item.id ? "nav-active" : ""}`}
                onClick={() => { setPage(item.id); setSidebarOpen(false); }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <code>@00akshatsinha00/convex-api-keys</code>
        </div>
      </nav>

      {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}
    </div>
  );
}

export default App;
