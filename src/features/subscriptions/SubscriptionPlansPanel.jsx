import { PLAN_CATALOG, getPlan } from "./plans";

export default function SubscriptionPlansPanel({
  planSummary,
  loading = false,
  purchasesEnabled = false,
  onChoosePlan,
  onRestorePurchases,
}) {
  const currentPlan = getPlan(planSummary?.plan);

  return (
    <section className="subscription-plans-panel" aria-labelledby="plans-title">
      <div className="subscription-plans-heading">
        <div>
          <p className="season-label">ORGANIZER PLANS</p>
          <h3 id="plans-title">Grow when your league does</h3>
          <p>
            Playing and joining leagues stay free. Paid plans are only for
            organizers who need more room and tools.
          </p>
        </div>
        <span className="current-plan-pill">
          {loading ? "Checking plan…" : `${currentPlan.name} plan`}
        </span>
      </div>

      {!purchasesEnabled && (
        <div className="subscription-preview-note" role="status">
          Plans are being prepared for App Store launch. Purchases are not active
          yet, and this screen cannot charge you.
        </div>
      )}

      <div className="subscription-plan-grid">
        {PLAN_CATALOG.map((plan) => {
          const isCurrent = currentPlan.id === plan.id;
          const isPaid = Boolean(plan.productId);
          const canChoose = purchasesEnabled && isPaid && !isCurrent;

          return (
            <article
              className={`subscription-plan-card subscription-plan-${plan.id}${
                isCurrent ? " subscription-plan-current" : ""
              }`}
              key={plan.id}
            >
              <div className="subscription-plan-title-row">
                <h4>{plan.name}</h4>
                {isCurrent && <span>Current</span>}
              </div>
              <div className="subscription-plan-price">
                <strong>{plan.price}</strong>
                <span>{plan.cadence}</span>
              </div>
              <p>{plan.description}</p>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <span aria-hidden="true">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={plan.id === "pro" ? "primary-button" : "secondary-button"}
                disabled={!canChoose}
                onClick={() => canChoose && onChoosePlan?.(plan)}
              >
                {isCurrent
                  ? "Current plan"
                  : purchasesEnabled && isPaid
                    ? `Choose ${plan.name}`
                    : isPaid
                      ? "Available at launch"
                      : "Included"}
              </button>
            </article>
          );
        })}
      </div>

      <div className="subscription-plans-footer">
        <p>
          Upgrading never removes your league data. Apple will show the final
          localized price before any purchase is confirmed.
        </p>
        {purchasesEnabled && (
          <button
            type="button"
            className="subscription-restore-button"
            onClick={onRestorePurchases}
          >
            Restore Purchases
          </button>
        )}
      </div>
    </section>
  );
}
