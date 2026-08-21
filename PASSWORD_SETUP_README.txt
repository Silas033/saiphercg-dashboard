SAIPHER CG LOCAL DASHBOARD - PASSWORD SETUP / RESET
===================================================

This dashboard stays local-only. The password setup email must redirect back
into the local dashboard so Supabase can create a recovery session.

ONE-TIME SUPABASE AUTH URL CONFIGURATION
----------------------------------------
In Supabase Dashboard:
Authentication -> URL Configuration

Recommended Site URL for normal local use:
    http://127.0.0.1:4173

Add these Redirect URLs:
    http://127.0.0.1:4173/**
    http://localhost:5173/**

The first URL is used by start-dashboard.bat.
The second URL is useful while developing with npm run dev.

HOW AN ADMIN SETS A PASSWORD
----------------------------
1. Start the dashboard first.
2. Open http://127.0.0.1:4173
3. On Dashboard Login, click "Set / Forgot Password".
4. Enter an approved administrator email.
5. Click "Send Password Setup Email".
6. Keep the dashboard running.
7. Open the Supabase recovery email on the same computer.
8. Click the link in the email.
9. The local dashboard opens the "Create New Password" screen.
10. Enter the new password twice and save it.
11. The dashboard signs out.
12. Sign in normally using that email and the new password.

IMPORTANT
---------
- The administrator email must already exist in Supabase Authentication -> Users.
- It must also be one of the administrators approved by your RLS SQL allow-list.
- No service-role key belongs in this Vite dashboard.
- If the browser says "This site can't be reached", start start-dashboard.bat first
  and verify the Supabase URL Configuration shown above.
