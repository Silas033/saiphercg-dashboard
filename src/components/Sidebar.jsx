// src/components/Sidebar.jsx
import { useEffect, useState } from "react";
import { FaChevronDown } from "react-icons/fa";

export default function Sidebar({
    tabs,
    activeTab,
    setActiveTab,
    userEmail,
    onLogout,
}) {
    const [openMenu, setOpenMenu] = useState(null);

    useEffect(() => {
        const parentWithActiveChild = tabs.find((tab) =>
            tab.children?.some((child) => child.id === activeTab)
        );

        if (parentWithActiveChild) {
            setOpenMenu(parentWithActiveChild.id);
        }
    }, [activeTab, tabs]);

    function handleParentClick(tab) {
        const hasChildren = Boolean(tab.children?.length);

        setActiveTab(tab.id);

        if (hasChildren) {
            setOpenMenu((prev) => (prev === tab.id ? null : tab.id));
        }
    }

    return (
        <aside className="sidebar">
            <div className="sidebar-top"></div>

            <nav className="sidebar-nav">
                {tabs.map((tab) => {
                    const hasChildren = Boolean(tab.children?.length);
                    const isMenuOpen = openMenu === tab.id;
                    const isParentActive =
                        activeTab === tab.id ||
                        tab.children?.some((child) => child.id === activeTab);

                    return (
                        <div key={tab.id} className="nav-group">
                            <button
                                className={isParentActive ? "nav-item active" : "nav-item"}
                                onClick={() => handleParentClick(tab)}
                            >
                                <span className="nav-icon">{tab.icon}</span>
                                <span className="nav-label">{tab.label}</span>

                                {hasChildren && (
                                    <span className={`nav-caret ${isMenuOpen ? "open" : ""}`}>
                                        <FaChevronDown />
                                    </span>
                                )}
                            </button>

                            {hasChildren && (
                                <div className={`nav-submenu ${isMenuOpen ? "open" : ""}`}>
                                    {tab.children.map((child) => (
                                        <button
                                            key={child.id}
                                            className={
                                                activeTab === child.id
                                                    ? "nav-subitem active"
                                                    : "nav-subitem"
                                            }
                                            onClick={() => setActiveTab(child.id)}
                                        >
                                            {child.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            <div className="sidebar-account" title={userEmail || "Signed in"}>
                <span className="sidebar-account-label">Signed in as</span>
                <span className="sidebar-account-email">{userEmail || "Administrator"}</span>
            </div>

            <button className="logout-button" type="button" onClick={onLogout}>
                ⇦ Log Out
            </button>
        </aside>
    );
}
