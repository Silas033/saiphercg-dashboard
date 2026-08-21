import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function DashboardPasswordReset({ userEmail, onComplete, onCancel }) {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    async function handleSubmit(event) {
        event.preventDefault();
        setErrorMessage("");

        if (password.length < 8) {
            setErrorMessage("Use a password with at least 8 characters.");
            return;
        }

        if (password !== confirmPassword) {
            setErrorMessage("The two passwords do not match.");
            return;
        }

        setLoading(true);

        const { error } = await supabase.auth.updateUser({
            password,
        });

        if (error) {
            setErrorMessage(error.message || "Unable to update the password.");
            setLoading(false);
            return;
        }

        setLoading(false);
        await onComplete();
    }

    return (
        <main className="dashboard-login-page">
            <section className="dashboard-login-card" aria-labelledby="dashboard-password-title">
                <div className="dashboard-login-brand-mark" aria-hidden="true">S</div>

                <div className="dashboard-login-heading">
                    <p className="dashboard-login-eyebrow">SAIPHER CG</p>
                    <h1 id="dashboard-password-title">Create New Password</h1>
                    <p>
                        Set the password that this administrator will use when signing in to the local dashboard.
                    </p>
                </div>

                {userEmail && (
                    <div className="dashboard-recovery-account">
                        Administrator: <strong>{userEmail}</strong>
                    </div>
                )}

                <form className="dashboard-login-form" onSubmit={handleSubmit}>
                    <label className="dashboard-login-field">
                        <span>New password</span>
                        <div className="dashboard-password-field">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="At least 8 characters"
                                autoComplete="new-password"
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

                    <label className="dashboard-login-field">
                        <span>Confirm new password</span>
                        <input
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            placeholder="Enter it again"
                            autoComplete="new-password"
                            disabled={loading}
                        />
                    </label>

                    {errorMessage && (
                        <div className="dashboard-login-error" role="alert">
                            {errorMessage}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="dashboard-login-submit"
                        disabled={loading}
                    >
                        {loading ? "Saving password..." : "Save New Password"}
                    </button>
                </form>

                <div className="dashboard-login-secondary-actions">
                    <button
                        type="button"
                        className="dashboard-login-link-button"
                        onClick={onCancel}
                        disabled={loading}
                    >
                        Cancel and Return to Login
                    </button>
                </div>

                <p className="dashboard-login-note">
                    After saving, you will be signed out and can log in normally with the new password.
                </p>
            </section>
        </main>
    );
}
