import { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function DashboardLogin({ noticeMessage = "" }) {
    const [mode, setMode] = useState("signin");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const localResetUrl = useMemo(
        () => `${window.location.origin}/?reset-password=1`,
        []
    );

    function clearMessages() {
        setErrorMessage("");
        setSuccessMessage("");
    }

    function switchMode(nextMode) {
        setMode(nextMode);
        setPassword("");
        clearMessages();
    }

    async function handleSignIn(event) {
        event.preventDefault();

        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedEmail || !password) {
            setErrorMessage("Enter your administrator email and password.");
            return;
        }

        setLoading(true);
        clearMessages();

        const { error } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
        });

        if (error) {
            setErrorMessage(
                "Unable to sign in. Check the email/password, or use Set / Forgot Password below if this account does not have a password yet."
            );
            setLoading(false);
            return;
        }

        // App.jsx listens for SIGNED_IN and opens the dashboard.
        setLoading(false);
    }

    async function handlePasswordEmail(event) {
        event.preventDefault();

        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedEmail) {
            setErrorMessage("Enter the administrator email that needs a password.");
            return;
        }

        setLoading(true);
        clearMessages();

        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
            redirectTo: localResetUrl,
        });

        if (error) {
            setErrorMessage(error.message || "Unable to send the password setup email.");
            setLoading(false);
            return;
        }

        setSuccessMessage(
            "Password setup email sent. Keep this local dashboard running, open the email on this computer, and click the reset link."
        );
        setLoading(false);
    }

    const isResetRequest = mode === "reset-request";

    return (
        <main className="dashboard-login-page">
            <section className="dashboard-login-card" aria-labelledby="dashboard-login-title">
                <div className="dashboard-login-brand-mark" aria-hidden="true">S</div>

                <div className="dashboard-login-heading">
                    <p className="dashboard-login-eyebrow">SAIPHER CG</p>
                    <h1 id="dashboard-login-title">
                        {isResetRequest ? "Set / Reset Password" : "Dashboard Login"}
                    </h1>
                    <p>
                        {isResetRequest
                            ? "Use this for an invited administrator who never created a password, or for a forgotten password."
                            : "Sign in with an approved administrator account to manage the storefront."}
                    </p>
                </div>

                {noticeMessage && !isResetRequest && (
                    <div className="dashboard-login-success" role="status">
                        {noticeMessage}
                    </div>
                )}

                <form
                    className="dashboard-login-form"
                    onSubmit={isResetRequest ? handlePasswordEmail : handleSignIn}
                >
                    <label className="dashboard-login-field">
                        <span>Email</span>
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="admin@example.com"
                            autoComplete="email"
                            disabled={loading}
                        />
                    </label>

                    {!isResetRequest && (
                        <label className="dashboard-login-field">
                            <span>Password</span>
                            <div className="dashboard-password-field">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="Enter your password"
                                    autoComplete="current-password"
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    className="dashboard-password-toggle"
                                    onClick={() => setShowPassword((current) => !current)}
                                    disabled={loading}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? "Hide" : "Show"}
                                </button>
                            </div>
                        </label>
                    )}

                    {errorMessage && (
                        <div className="dashboard-login-error" role="alert">
                            {errorMessage}
                        </div>
                    )}

                    {successMessage && (
                        <div className="dashboard-login-success" role="status">
                            {successMessage}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="dashboard-login-submit"
                        disabled={loading}
                    >
                        {loading
                            ? isResetRequest
                                ? "Sending email..."
                                : "Signing in..."
                            : isResetRequest
                                ? "Send Password Setup Email"
                                : "Sign In"}
                    </button>
                </form>

                <div className="dashboard-login-secondary-actions">
                    {isResetRequest ? (
                        <button
                            type="button"
                            className="dashboard-login-link-button"
                            onClick={() => switchMode("signin")}
                            disabled={loading}
                        >
                            Back to Sign In
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="dashboard-login-link-button"
                            onClick={() => switchMode("reset-request")}
                            disabled={loading}
                        >
                            Set / Forgot Password
                        </button>
                    )}
                </div>

                {isResetRequest && (
                    <div className="dashboard-login-reset-help">
                        <strong>Important:</strong> the reset email returns to this local dashboard.
                        Keep the dashboard server running before clicking the email link.
                    </div>
                )}

                <p className="dashboard-login-note">
                    This dashboard is intended to run only on the trusted local computer.
                </p>
            </section>
        </main>
    );
}
