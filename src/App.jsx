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
        children: [
            {
                id: "reorder-products",
                label: "Reorder Products",
            },
        ],
    },
    {
        id: "profile",
        label: "Company Pages",
        icon: "🏢",
    },
    {
        id: "transactions",
        label: "Transactions",
        icon: "↻",
    },
    // {
    //     id: "notifications",
    //     label: "Notifications",
    //     icon: "🔔",
    // },
];

function hasPasswordResetFlag() {
    return (
        new URLSearchParams(
            window.location.search
        ).get("reset-password") === "1"
    );
}

function clearPasswordResetUrl() {
    window.history.replaceState(
        {},
        document.title,
        window.location.pathname
    );
}

export default function App() {
    const [session, setSession] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    // -------------------------------------------------------
    // ADMIN ACCESS CHECK
    // -------------------------------------------------------

    const [isAdmin, setIsAdmin] = useState(false);

    // Stores which user ID has already been checked.
    // This prevents a previous user's admin status
    // from accidentally being reused after changing accounts.
    const [checkedAdminUserId, setCheckedAdminUserId] =
        useState(null);

    const [passwordRecovery, setPasswordRecovery] =
        useState(hasPasswordResetFlag());

    const [loginNotice, setLoginNotice] = useState("");
    const [activeTab, setActiveTab] =
        useState("products");

    const [editingProduct, setEditingProduct] =
        useState(null);

    // -------------------------------------------------------
    // RESTORE / MONITOR SUPABASE LOGIN SESSION
    // -------------------------------------------------------

    useEffect(() => {
        let isMounted = true;

        async function loadExistingSession() {
            const { data, error } =
                await supabase.auth.getSession();

            if (!isMounted) return;

            if (error) {
                console.error(
                    "Unable to restore Supabase session:",
                    error
                );

                setSession(null);
            } else {
                setSession(data.session ?? null);
            }

            setAuthLoading(false);
        }

        loadExistingSession();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(
            (event, nextSession) => {
                if (!isMounted) return;

                if (event === "PASSWORD_RECOVERY") {
                    setPasswordRecovery(true);
                }

              const nextUserId = nextSession?.user?.id ?? null;

                setSession((prevSession) => {
                    const prevUserId = prevSession?.user?.id ?? null;

                    if (nextUserId !== prevUserId) {
                        setIsAdmin(false);
                        setCheckedAdminUserId(null);
                    }

                    return nextSession ?? null;
                });

                setAuthLoading(false);
            }
        );

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    // -------------------------------------------------------
    // VERIFY THAT THE LOGGED-IN USER IS AN APPROVED ADMIN
    // -------------------------------------------------------

    useEffect(() => {
        let cancelled = false;

        const userId = session?.user?.id;

        // No logged-in user = no admin access.
        if (!userId) {
            setIsAdmin(false);
            setCheckedAdminUserId(null);

            return () => {
                cancelled = true;
            };
        }

        async function checkDashboardAdmin() {
            // Reset authorization while checking.
            setIsAdmin(false);
            setCheckedAdminUserId(null);

            try {
                const { data, error } =
                    await supabase.rpc(
                        "is_dashboard_admin"
                    );

                if (cancelled) return;

                if (error) {
                    console.error(
                        "Unable to verify dashboard administrator:",
                        error
                    );

                    setIsAdmin(false);
                    setCheckedAdminUserId(userId);
                    return;
                }

                setIsAdmin(data === true);
                setCheckedAdminUserId(userId);
            } catch (error) {
                if (cancelled) return;

                console.error(
                    "Unexpected dashboard authorization error:",
                    error
                );

                setIsAdmin(false);
                setCheckedAdminUserId(userId);
            }
        }

        checkDashboardAdmin();

        return () => {
            cancelled = true;
        };
    }, [session?.user?.id]);

    // -------------------------------------------------------
    // LOGOUT
    // -------------------------------------------------------

    async function handleLogout() {
        // Immediately clear local authorization state.
        setIsAdmin(false);
        setCheckedAdminUserId(null);

        const { error } =
            await supabase.auth.signOut({
                scope: "local",
            });

        if (error) {
            console.error(
                "Unable to sign out:",
                error
            );

            window.alert(
                "Unable to sign out. Please try again."
            );
        }
    }

    // -------------------------------------------------------
    // PASSWORD RESET
    // -------------------------------------------------------

    async function handlePasswordResetComplete() {
        clearPasswordResetUrl();

        setPasswordRecovery(false);

        setLoginNotice(
            "Password saved successfully. Sign in with your new password."
        );

        setIsAdmin(false);
        setCheckedAdminUserId(null);

        const { error } =
            await supabase.auth.signOut({
                scope: "local",
            });

        if (error) {
            console.error(
                "Password was updated, but local sign-out failed:",
                error
            );

            window.location.reload();
        }
    }

    async function handlePasswordResetCancel() {
        clearPasswordResetUrl();

        setPasswordRecovery(false);
        setLoginNotice("");

        setIsAdmin(false);
        setCheckedAdminUserId(null);

        if (session?.user) {
            await supabase.auth.signOut({
                scope: "local",
            });
        }
    }

    // -------------------------------------------------------
    // PRODUCT EDITING
    // -------------------------------------------------------

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

    // -------------------------------------------------------
    // PAGE RENDERING
    // -------------------------------------------------------

    function renderPage() {
        switch (activeTab) {
            case "products":
                return (
                    <Products
                        onEditProduct={
                            handleEditProduct
                        }
                    />
                );

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
                        onCancel={() =>
                            setActiveTab(
                                "products"
                            )
                        }
                        onSaved={
                            handleProductSaved
                        }
                    />
                );
        }
    }

    // -------------------------------------------------------
    // AUTH LOADING SCREEN
    // -------------------------------------------------------

    if (authLoading) {
        return (
            <div
                className="dashboard-auth-loading"
                role="status"
                aria-live="polite"
            >
                <div
                    className="dashboard-auth-spinner"
                    aria-hidden="true"
                />

                <span>
                    Loading dashboard...
                </span>
            </div>
        );
    }

    // -------------------------------------------------------
    // PASSWORD RECOVERY SCREEN
    // -------------------------------------------------------

    if (passwordRecovery) {
        if (session?.user) {
            return (
                <DashboardPasswordReset
                    userEmail={
                        session.user.email
                    }
                    onComplete={
                        handlePasswordResetComplete
                    }
                    onCancel={
                        handlePasswordResetCancel
                    }
                />
            );
        }

        return (
            <DashboardLogin
                noticeMessage="The password link could not create a recovery session. Request a new password setup email below."
            />
        );
    }

    // -------------------------------------------------------
    // NOT LOGGED IN
    // -------------------------------------------------------

    if (!session?.user) {
        return (
            <DashboardLogin
                noticeMessage={loginNotice}
            />
        );
    }

    // -------------------------------------------------------
    // WAIT WHILE ADMIN PERMISSION IS CHECKED
    // -------------------------------------------------------

    const adminCheckFinished =
        checkedAdminUserId ===
        session.user.id;

    if (!adminCheckFinished) {
        return (
            <div
                className="dashboard-auth-loading"
                role="status"
                aria-live="polite"
            >
                <div
                    className="dashboard-auth-spinner"
                    aria-hidden="true"
                />

                <span>
                    Verifying dashboard access...
                </span>
            </div>
        );
    }

    // -------------------------------------------------------
    // LOGGED IN BUT NOT AN APPROVED DASHBOARD ADMIN
    // -------------------------------------------------------

    if (!isAdmin) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "24px",
                    background: "#111",
                    color: "#fff",
                }}
            >
                <div
                    style={{
                        width: "100%",
                        maxWidth: "520px",
                        padding: "36px",
                        border: "1px solid rgba(255,255,255,0.14)",
                        borderRadius: "18px",
                        background:
                            "rgba(255,255,255,0.04)",
                        textAlign: "center",
                    }}
                >
                    <h1
                        style={{
                            marginTop: 0,
                            marginBottom: "12px",
                            fontSize: "28px",
                        }}
                    >
                        Access Denied
                    </h1>

                    <p
                        style={{
                            marginBottom: "8px",
                            opacity: 0.8,
                            lineHeight: 1.6,
                        }}
                    >
                        This account is not
                        authorized to access the
                        Saipher CG Dashboard.
                    </p>

                    <p
                        style={{
                            marginTop: 0,
                            marginBottom: "24px",
                            opacity: 0.55,
                            fontSize: "14px",
                        }}
                    >
                        {session.user.email}
                    </p>

                    <button
                        type="button"
                        onClick={handleLogout}
                        style={{
                            padding:
                                "12px 24px",
                            border: "none",
                            borderRadius: "10px",
                            cursor: "pointer",
                            fontWeight: 700,
                        }}
                    >
                        Sign Out
                    </button>
                </div>
            </div>
        );
    }

    // -------------------------------------------------------
    // APPROVED ADMIN — SHOW DASHBOARD
    // -------------------------------------------------------

    return (
        <div className="app-shell">
            <Sidebar
                tabs={tabs}
                activeTab={
                    activeTab ===
                    "edit-product"
                        ? "products"
                        : activeTab
                }
                setActiveTab={setActiveTab}
                userEmail={
                    session.user.email
                }
                onLogout={handleLogout}
            />

            <div className="content-panel">
                <Topbar
                    userEmail={
                        session.user.email
                    }
                />

                <div className="content-body">
                    {renderPage()}
                </div>
            </div>
        </div>
    );
}