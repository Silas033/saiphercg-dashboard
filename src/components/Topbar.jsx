// src/components/Topbar.jsx
export default function Topbar({ userEmail }) {
    return (
        <header className="topbar">
            <div className="topbar-title">Saipher CG Dashboard</div>
            <div className="topbar-session" title={userEmail || "Administrator"}>
                <span className="topbar-status-dot" aria-hidden="true"></span>
                <span>Administrator</span>
            </div>
        </header>
    );
}
