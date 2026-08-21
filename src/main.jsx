// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

import "./styles/global.css";
import "./styles/sidebar.css";
import "./styles/topbar.css";
import "./styles/addproduct.css";
import "./styles/dashboard-login.css";

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
