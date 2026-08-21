// src/App.jsx
import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import DashboardLogin from "./components/DashboardLogin";
import DashboardPasswordReset from "./components/DashboardPasswordReset";
import AddProduct from "./pages/AddProduct";
import EditProduct from "./pages/EditProduct";
import Products from "./pages/Products";
import ReorderProducts from "./pages/ReorderProducts";
import Transactions from "./pages/Transactions";
import Profile from "./pages/Profile";
import Notifications from "./pages/Notifications";
import { supabase } from "./lib/supabaseClient";

const tabs = [
    { id: "add-product", label: "Add Product", icon: "📋" },
    {
        id: "products",
        label: "Products",
        icon: "☰",
        children: [{ id: "reorder-products", label: "Reorder Products" }],
    },
    { id: "profile", label: "Company Pages", icon: "🏢" },
    { id: "transactions", label: "Transactions", icon: "↻" },
    // { id: "notifications", label: "Notifications", icon: "🔔" },
];

function hasPasswordResetFlag() {
    return new URLSearchParams(window.location.search).get("reset-password") === "1";
}

function clearPasswordResetUrl() {
    window.history.replaceState({}, document.title, window.location.pathname);
}

export default function App() {
    const [session, setSession] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [passwordRecovery, setPasswordRecovery] = useState(hasPasswordResetFlag());
    const [loginNotice, setLoginNotice] = useState("");
    const [activeTab, setActiveTab] = useState("products");
    const [editingProduct, setEditingProduct] = useState(null);

    useEffect(() => {
        let isMounted = true;

        async function loadExistingSession() {
            const { data, error } = await supabase.auth.getSession();

            if (!isMounted) return;

            if (error) {
                console.error("Unable to restore Supabase session:", error);
                setSession(null);
            } else {
                setSession(data.session ?? null);
            }

            setAuthLoading(false);
        }

        loadExistingSession();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, nextSession) => {
            if (!isMounted) return;

            if (event === "PASSWORD_RECOVERY") {
                setPasswordRecovery(true);
            }

            setSession(nextSession ?? null);
            setAuthLoading(false);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    async function handleLogout() {
        const { error } = await supabase.auth.signOut({ scope: "local" });

        if (error) {
            console.error("Unable to sign out:", error);
            window.alert("Unable to sign out. Please try again.");
        }
    }

    async function handlePasswordResetComplete() {
        clearPasswordResetUrl();
        setPasswordRecovery(false);
        setLoginNotice("Password saved successfully. Sign in with your new password.");

        const { error } = await supabase.auth.signOut({ scope: "local" });

        if (error) {
            console.error("Password was updated, but local sign-out failed:", error);
            window.location.reload();
        }
    }

    async function handlePasswordResetCancel() {
        clearPasswordResetUrl();
        setPasswordRecovery(false);
        setLoginNotice("");

        if (session?.user) {
            await supabase.auth.signOut({ scope: "local" });
        }
    }

    function handleEditProduct(product) {
        setEditingProduct(product);
        setActiveTab("edit-product");
    }

    function handleExitEdit() {
        setEditingProduct(null);
        setActiveTab("products");
    }

    function handleProductSaved() {
        setActiveTab("products");
    }

    function renderPage() {
        switch (activeTab) {
            case "products":
                return <Products onEditProduct={handleEditProduct} />;
            case "reorder-products":
                return <ReorderProducts />;
            case "edit-product":
                return (
                    <EditProduct
                        product={editingProduct}
                        onCancel={handleExitEdit}
                        onSave={handleExitEdit}
                    />
                );
            case "profile":
                return <Profile />;
            case "transactions":
                return <Transactions />;
            case "notifications":
                return <Notifications />;
            default:
                return (
                    <AddProduct
                        onCancel={() => setActiveTab("products")}
                        onSaved={handleProductSaved}
                    />
                );
        }
    }

    if (authLoading) {
        return (
            <div className="dashboard-auth-loading" role="status" aria-live="polite">
                <div className="dashboard-auth-spinner" aria-hidden="true" />
                <span>Loading dashboard...</span>
            </div>
        );
    }

    if (passwordRecovery) {
        if (session?.user) {
            return (
                <DashboardPasswordReset
                    userEmail={session.user.email}
                    onComplete={handlePasswordResetComplete}
                    onCancel={handlePasswordResetCancel}
                />
            );
        }

        return (
            <DashboardLogin
                noticeMessage="The password link could not create a recovery session. Request a new password setup email below."
            />
        );
    }

    if (!session?.user) {
        return <DashboardLogin noticeMessage={loginNotice} />;
    }

    return (
        <div className="app-shell">
            <Sidebar
                tabs={tabs}
                activeTab={activeTab === "edit-product" ? "products" : activeTab}
                setActiveTab={setActiveTab}
                userEmail={session.user.email}
                onLogout={handleLogout}
            />
            <div className="content-panel">
                <Topbar userEmail={session.user.email} />
                <div className="content-body">{renderPage()}</div>
            </div>
        </div>
    );
}
