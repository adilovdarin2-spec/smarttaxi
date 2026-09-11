import React, { useEffect, useMemo, useState } from "react";
import StandMapEditor from "./StandMapEditor.jsx";
import { Badge, PageHeader, SegmentedFilter, StatePanel } from "./adminUi.jsx";

const KIND_LABELS = { CITY: "По городу", INTERCITY: "Межгород" };

const emptyDraft = (regionId) => ({
  id: null,
  regionId,
  name: "",
  kind: "CITY",
  lat: null,
  lng: null,
  radiusM: 120,
  boardingSlots: 1,
  defaultSeats: 4,
  note: "",
  isActive: true
});

function standToDraft(stand) {
  return {
    id: stand.id,
    regionId: stand.regionId,
    name: stand.name,
    kind: stand.kind,
    lat: stand.lat,
    lng: stand.lng,
    radiusM: stand.radiusM,
    boardingSlots: stand.boardingSlots,
    defaultSeats: stand.defaultSeats,
    note: stand.note || "",
    isActive: stand.isActive
  };
}

export default function StandsPage({
  stands,
  regions,
  standRegion,
  setStandRegion,
  onCreateStand,
  onUpdateStand,
  onDeleteStand,
  busy,
  actionError
}) {
  const activeRegions = useMemo(
    () => regions.filter((region) => region.isActive ?? region.is_active ?? true),
    [regions]
  );
  const selectedRegion = useMemo(
    () => activeRegions.find((region) => region.id === standRegion) || activeRegions[0] || null,
    [activeRegions, standRegion]
  );
  const [draft, setDraft] = useState(() => emptyDraft(selectedRegion?.id));
  const [statusFilter, setStatusFilter] = useState("all");

  // Switching region starts a fresh stand rather than carrying a half-drawn
  // one across a boundary it would be rejected at.
  useEffect(() => {
    setDraft(emptyDraft(selectedRegion?.id));
  }, [selectedRegion?.id]);

  const regionStands = stands.filter((stand) => stand.regionId === selectedRegion?.id);
  const visibleStands = regionStands.filter((stand) => {
    if (statusFilter === "active") return stand.isActive;
    if (statusFilter === "closed") return !stand.isActive;
    return true;
  });
  const otherStands = regionStands.filter((stand) => stand.id !== draft.id);

  const center = draft.lat && draft.lng
    ? { lat: Number(draft.lat), lng: Number(draft.lng) }
    : {
        lat: Number(selectedRegion?.centerLat ?? selectedRegion?.center_lat ?? 40.8444),
        lng: Number(selectedRegion?.centerLng ?? selectedRegion?.center_lng ?? 68.509)
      };

  const canSave = Boolean(draft.name.trim().length >= 2 && draft.lat && draft.lng && selectedRegion);

  function submit(event) {
    event.preventDefault();
    if (!canSave) return;
    const payload = {
      name: draft.name.trim(),
      kind: draft.kind,
      lat: Number(draft.lat),
      lng: Number(draft.lng),
      radiusM: Number(draft.radiusM),
      boardingSlots: Number(draft.boardingSlots),
      defaultSeats: Number(draft.defaultSeats),
      note: draft.note.trim(),
      isActive: draft.isActive
    };
    if (draft.id) {
      onUpdateStand(draft.id, payload);
    } else {
      onCreateStand({ ...payload, regionId: selectedRegion.id });
    }
  }

  return (
    <div className="admin-page-stack">
      <PageHeader
        title="Стоянки"
        subtitle="Места, где водители стоят в очереди — по городу и на межгород"
      >
        <label className="admin-field inline">
          <span>Регион</span>
          <select value={selectedRegion?.id || ""} onChange={(event) => setStandRegion(event.target.value)}>
            {activeRegions.map((region) => (
              <option key={region.id} value={region.id}>{region.name}</option>
            ))}
          </select>
        </label>
        <SegmentedFilter
          value={statusFilter}
          onChange={setStatusFilter}
          items={[["all", "Все"], ["active", "Открытые"], ["closed", "Закрытые"]]}
        />
      </PageHeader>

      {!selectedRegion ? (
        <StatePanel title="Нет активных регионов" text="Сначала включите регион на странице «Регионы»." />
      ) : (
        <div className="stand-editor-grid">
          <form className="stand-editor-form admin-data-card" onSubmit={submit}>
            <header>
              <div>
                <h2>{draft.id ? "Стоянка" : "Новая стоянка"}</h2>
                <p>Поставьте точку на карте и задайте радиус — по нему проверяется, что водитель реально стоит на месте.</p>
              </div>
              {draft.id && (
                <button
                  type="button"
                  className="admin-secondary-button compact"
                  onClick={() => setDraft(emptyDraft(selectedRegion.id))}
                >
                  Новая
                </button>
              )}
            </header>

            <StandMapEditor
              center={center}
              draft={draft}
              otherStands={otherStands}
              disabled={busy}
              onMove={(point) => setDraft((current) => ({ ...current, ...point }))}
              onRadiusChange={(radiusM) => setDraft((current) => ({ ...current, radiusM }))}
            />

            <div className="stand-editor-fields">
              <label className="admin-field">
                <span>Название</span>
                <input
                  value={draft.name}
                  maxLength={80}
                  placeholder="Например: Базар, межгород"
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="admin-field">
                <span>Тип</span>
                <select
                  value={draft.kind}
                  onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value }))}
                >
                  <option value="CITY">По городу</option>
                  <option value="INTERCITY">Межгород</option>
                </select>
              </label>
              <label className="admin-field">
                <span>Машин набирают одновременно</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={draft.boardingSlots}
                  onChange={(event) => setDraft((current) => ({ ...current, boardingSlots: event.target.value }))}
                />
              </label>
              <label className="admin-field">
                <span>Мест в машине по умолчанию</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={draft.defaultSeats}
                  onChange={(event) => setDraft((current) => ({ ...current, defaultSeats: event.target.value }))}
                />
              </label>
              <label className="admin-field wide">
                <span>Заметка для водителей</span>
                <input
                  value={draft.note}
                  maxLength={300}
                  placeholder="Например: заезд со стороны улицы Абая"
                  onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                />
              </label>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
                />
                <span>Стоянка открыта</span>
              </label>
            </div>

            {actionError && <p className="admin-inline-error">{actionError}</p>}

            <div className="stand-editor-actions">
              <button type="submit" className="admin-primary-button" disabled={!canSave || busy}>
                {draft.id ? "Сохранить" : "Создать стоянку"}
              </button>
              {draft.id && (
                <button
                  type="button"
                  className="admin-secondary-button danger"
                  disabled={busy}
                  onClick={() => onDeleteStand(draft.id)}
                >
                  Удалить
                </button>
              )}
            </div>
          </form>

          <section className="admin-data-card stand-list-card">
            <header>
              <div>
                <h2>Стоянки региона</h2>
                <p>{regionStands.length ? `Всего: ${regionStands.length}` : "Пока ни одной"}</p>
              </div>
            </header>
            {!visibleStands.length ? (
              <StatePanel
                title="Стоянок нет"
                text="Поставьте точку на карте слева и сохраните — водители увидят её сразу."
              />
            ) : (
              <ul className="stand-list">
                {visibleStands.map((stand) => (
                  <li key={stand.id} className={stand.id === draft.id ? "selected" : ""}>
                    <button type="button" onClick={() => setDraft(standToDraft(stand))}>
                      <div className="stand-list-title">
                        <strong>{stand.name}</strong>
                        <Badge tone={stand.isActive ? "success" : "muted"}>
                          {stand.isActive ? "Открыта" : "Закрыта"}
                        </Badge>
                      </div>
                      <div className="stand-list-meta">
                        <span>{KIND_LABELS[stand.kind] || stand.kind}</span>
                        <span>радиус {stand.radiusM} м</span>
                        <span>{stand.driversCount} машин в очереди</span>
                        {stand.driversCount > 0 && <span>{stand.freeSeats} свободных мест</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
