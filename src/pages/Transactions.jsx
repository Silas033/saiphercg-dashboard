import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaBoxOpen,
  FaCalendarAlt,
  FaChevronRight,
  FaEnvelope,
  FaFilter,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaSearch,
  FaShoppingCart,
  FaStickyNote,
  FaSyncAlt,
  FaTimes,
  FaTrashAlt,
  FaUser,
} from "react-icons/fa";
import { supabase } from "../lib/supabaseClient";
import "../styles/transactions.css";

const STATUS_OPTIONS = [
  {
    value: "not_completed",
    label: "Not completed",
  },
  {
    value: "completed",
    label: "Completed",
  },
];

const TRANSACTION_SELECT = `
  id,
  order_number,
  status,
  customer_name,
  email,
  contact_number,
  shipping_address,
  note,
  currency,
  subtotal,
  total_amount,
  created_at,
  updated_at,
  completed_at,
  transaction_items (
    id,
    product_id,
    variant_id,
    product_name,
    variant_label,
    quantity,
    unit_price,
    line_total,
    selected_pieces,
    item_note,
    product_image_url
  )
`;

const formatMoney = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDateTime = (value) =>
  new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadTransactions = useCallback(
    async ({ quiet = false } = {}) => {
      if (quiet) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const { data, error: fetchError } = await supabase
        .from("transactions")
        .select(TRANSACTION_SELECT)
        .order("created_at", {
          ascending: false,
        });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        const normalized = (data || []).map((transaction) => ({
          ...transaction,

          transaction_items: [
            ...(transaction.transaction_items || []),
          ].sort((a, b) => Number(a.id) - Number(b.id)),
        }));

        setTransactions(normalized);

        setSelectedTransaction((current) =>
          current
            ? normalized.find((item) => item.id === current.id) || null
            : null
        );
      }

      setLoading(false);
      setRefreshing(false);
    },
    []
  );

  useEffect(() => {
    loadTransactions();

    const channel = supabase
      .channel("dashboard-transactions-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
        },
        () => {
          loadTransactions({
            quiet: true,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTransactions]);

  const filteredTransactions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return transactions.filter((transaction) => {
      if (
        statusFilter !== "all" &&
        transaction.status !== statusFilter
      ) {
        return false;
      }

      if (!term) {
        return true;
      }

      const searchable = [
        transaction.order_number,
        transaction.customer_name,
        transaction.email,
        transaction.contact_number,
        transaction.shipping_address,
        transaction.note,

        ...(transaction.transaction_items || []).flatMap((item) => [
          item.product_name,
          item.variant_label,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [transactions, searchTerm, statusFilter]);

  const updateStatus = async (transactionId, status) => {
    setUpdatingId(transactionId);
    setError("");

    const { error: updateError } = await supabase
      .from("transactions")
      .update({
        status,
      })
      .eq("id", transactionId);

    if (updateError) {
      setError(updateError.message);
    } else {
      await loadTransactions({
        quiet: true,
      });
    }

    setUpdatingId(null);
  };

  const deleteTransaction = async (transaction) => {
    const confirmed = window.confirm(
      `Delete ${transaction.order_number}? This permanently removes the transaction and its line items.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(transaction.id);
    setError("");

    const { error: deleteError } = await supabase
      .from("transactions")
      .delete()
      .eq("id", transaction.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      setSelectedTransaction(null);

      await loadTransactions({
        quiet: true,
      });
    }

    setDeletingId(null);
  };

  return (
    <section className="transactions-page">
      <header className="transactions-page-header">
        <div>
          <h1>Transaction Management</h1>

          <p>
            Review storefront orders, update their status, and inspect
            complete customer and cart information.
          </p>
        </div>

        <div className="transactions-header-actions">
          <div className="live-order-badge">
            <span />

            Live Order Stream
          </div>
        </div>
      </header>

      <div className="transactions-toolbar">
        <label className="transactions-search">
          <FaSearch />

          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by Order ID, Customer Name, Email, Contact, or Address..."
          />
        </label>

        <div className="transactions-filter">
          <FaFilter />

          <span>Status filter:</span>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All Statuses</option>

            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="transactions-refresh"
          onClick={() =>
            loadTransactions({
              quiet: true,
            })
          }
          disabled={refreshing}
          aria-label="Refresh transactions"
          title="Refresh transactions"
        >
          <FaSyncAlt className={refreshing ? "is-spinning" : ""} />
        </button>
      </div>

      {error && <div className="transactions-error">{error}</div>}

      <div className="transactions-table-card">
        {loading ? (
          <div className="transactions-state">
            Loading transactions...
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="transactions-state">
            <FaBoxOpen />

            <strong>No transactions found</strong>

            <span>
              New storefront orders will appear here after customers
              submit their orders.
            </span>
          </div>
        ) : (
          <div className="transactions-table-scroll">
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Status</th>
                  <th>Date &amp; Time</th>
                  <th>Customer</th>
                  <th>Items Summary</th>
                  <th>Total</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredTransactions.map((transaction) => {
                  const items = transaction.transaction_items || [];
                  const firstItem = items[0];

                  const totalQuantity = items.reduce(
                    (sum, item) =>
                      sum + Number(item.quantity || 0),
                    0
                  );

                  return (
                    <tr key={transaction.id}>
                      <td>
                        <button
                          type="button"
                          className="transaction-order-id"
                          onClick={() =>
                            setSelectedTransaction(transaction)
                          }
                        >
                          {transaction.order_number}
                        </button>
                      </td>

                      <td>
                        <select
                          className={`transaction-status-select ${transaction.status}`}
                          value={transaction.status}
                          onChange={(event) =>
                            updateStatus(
                              transaction.id,
                              event.target.value
                            )
                          }
                          disabled={updatingId === transaction.id}
                          aria-label={`Status for ${transaction.order_number}`}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="transaction-date">
                        {formatDateTime(transaction.created_at)}
                      </td>

                      <td>
                        <strong>{transaction.customer_name}</strong>
                        <span>{transaction.email}</span>
                      </td>

                      <td>
                        <div className="transaction-item-summary">
                          <strong>
                            <FaShoppingCart />

                            {totalQuantity} item
                            {totalQuantity === 1 ? "" : "s"}
                          </strong>

                          <span>
                            {firstItem
                              ? `${firstItem.quantity}x ${firstItem.product_name}`
                              : "No line items"}

                            {items.length > 1
                              ? ` +${items.length - 1} more`
                              : ""}
                          </span>
                        </div>
                      </td>

                      <td className="transaction-total">
                        {formatMoney(transaction.total_amount)}
                      </td>

                      <td>
                        <div className="transaction-row-actions">
                          <button
                            type="button"
                            className="transaction-view-button"
                            onClick={() =>
                              setSelectedTransaction(transaction)
                            }
                          >
                            View

                            <FaChevronRight />
                          </button>

                          <button
                            type="button"
                            className="transaction-delete-icon"
                            onClick={() =>
                              deleteTransaction(transaction)
                            }
                            disabled={deletingId === transaction.id}
                            aria-label={`Delete ${transaction.order_number}`}
                            title="Delete order"
                          >
                            <FaTrashAlt />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedTransaction && (
        <TransactionDrawer
          transaction={selectedTransaction}
          updating={updatingId === selectedTransaction.id}
          deleting={deletingId === selectedTransaction.id}
          onClose={() => setSelectedTransaction(null)}
          onStatusChange={(status) =>
            updateStatus(selectedTransaction.id, status)
          }
          onDelete={() =>
            deleteTransaction(selectedTransaction)
          }
        />
      )}
    </section>
  );
}

function TransactionDrawer({
  transaction,
  updating,
  deleting,
  onClose,
  onStatusChange,
  onDelete,
}) {
  const items = transaction.transaction_items || [];

  const totalQuantity = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );

  return (
    <div
      className="transaction-sheet-overlay"
      onMouseDown={onClose}
    >
      <aside
        className="transaction-sheet"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label={`Transaction ${transaction.order_number}`}
      >
        <header className="transaction-sheet-header">
          <div>
            <div className="transaction-sheet-topline">
              <span className="transaction-file-badge">
                Transaction Order File
              </span>

              <select
                className={`transaction-status-select ${transaction.status}`}
                value={transaction.status}
                onChange={(event) =>
                  onStatusChange(event.target.value)
                }
                disabled={updating}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <h2>{transaction.order_number}</h2>

            <p>
              <FaCalendarAlt />

              {formatDateTime(transaction.created_at)}
            </p>
          </div>

          <div className="transaction-sheet-header-buttons">
            <button
              type="button"
              className="transaction-sheet-delete-top"
              onClick={onDelete}
              disabled={deleting}
              aria-label="Delete order"
            >
              <FaTrashAlt />
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
            >
              <FaTimes />
            </button>
          </div>
        </header>

        <div className="transaction-sheet-body">
          <section className="transaction-detail-card">
            <h3>
              <FaUser />

              Customer &amp; Delivery Details
            </h3>

            <div className="transaction-detail-grid">
              <Detail
                label="Customer Name"
                value={transaction.customer_name}
              />

              <Detail
                icon={<FaEnvelope />}
                label="Email Address"
                value={transaction.email}
              />

              <Detail
                icon={<FaPhoneAlt />}
                label="Contact Number"
                value={transaction.contact_number}
              />
            </div>

            <div className="transaction-address-block">
              <span>
                <FaMapMarkerAlt />

                Shipping Address
              </span>

              <p>{transaction.shipping_address}</p>
            </div>
          </section>

          <section className="transaction-items-section">
            <div className="transaction-section-heading">
              <h3>
                <FaShoppingCart />

                Cart Items Breakdown
              </h3>

              <span>
                {items.length} line item
                {items.length === 1 ? "" : "s"} ·{" "}
                {totalQuantity} unit
                {totalQuantity === 1 ? "" : "s"}
              </span>
            </div>

            <div className="transaction-items-table-wrap">
              <table className="transaction-items-table">
                <thead>
                  <tr>
                    <th>Product Name &amp; Variant</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Item Total</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.product_name}</strong>

                        <span>{item.variant_label}</span>

                        {item.selected_pieces && (
                          <small>
                            Box quantity: {item.selected_pieces}
                          </small>
                        )}

                        {item.item_note && (
                          <small>{item.item_note}</small>
                        )}
                      </td>

                      <td>x{item.quantity}</td>

                      <td>{formatMoney(item.unit_price)}</td>

                      <td>{formatMoney(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="transaction-total-card">
            <div>
              <span>Cart Items Subtotal</span>

              <strong>
                {formatMoney(transaction.subtotal)}
              </strong>
            </div>

            <div className="transaction-total-main">
              <span>Total Order Amount</span>

              <strong>
                {formatMoney(transaction.total_amount)}
              </strong>
            </div>
          </section>

          <section className="transaction-notes-section">
            <h3>
              <FaStickyNote />

              Customer Notes
            </h3>

            <p>
              {transaction.note ||
                "No customer notes   provided."}
            </p>
          </section>
        </div>

        <footer className="transaction-sheet-footer">
          <button
            type="button"
            className="transaction-delete-button"
            onClick={onDelete}
            disabled={deleting}
          >
            <FaTrashAlt />

            {deleting ? "Deleting..." : "Delete Order"}
          </button>

          <button
            type="button"
            className="transaction-close-button"
            onClick={onClose}
          >
            Close Transaction Sheet
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Detail({ icon, label, value }) {
  return (
    <div className="transaction-detail-item">
      <span>
        {icon}

        {label}
      </span>

      <strong>{value || "—"}</strong>
    </div>
  );
}