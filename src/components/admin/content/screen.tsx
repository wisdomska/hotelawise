'use client';
// Content from Admin.dc.html: photo slots, the gallery manager, page copy
// forms, venues, FAQ, testimonials, the banner and the list of pages.
import { useRef, useState, type CSSProperties } from 'react';
import {
  addGalleryAction,
  deleteFaqAction,
  deleteGalleryAction,
  deleteTestimonialAction,
  moveAction,
  saveBannerAction,
  saveCopyAction,
  saveFaqAction,
  saveGalleryAction,
  saveTestimonialAction,
  saveVenueAction,
  setSlotAction,
  signPhotoUpload,
  testimonialLiveAction,
} from '@/app/admin/(app)/content/actions';
import { Icon } from '@/components/ui/icon';
import { Select } from '@/components/ui/select';
import type { ContentData, FaqRow, GalleryRow, TestimonialRow } from '@/server/admin/content';
import { useAdmin } from '../context';
import { AreaField, ConfirmModal, FieldGrid, ModalFrame, TextField } from '../modal';
import { PageHeader, Switch, Tabs, useTab, type TabDef } from '../page-parts';
import { SettingsForm, type FormField } from '../settings-form';
import { c, col, DataTable } from '../table';
import { mono, panel, type Action } from '../ui';
import { pickFiles, thumb, uploadPhoto } from '../upload';
import { useAction } from '../use-action';

const CATS = ['Rooms', 'Bathrooms', 'Spaces', 'Events'] as const;
const GAL_PAGE = 12;

export function ContentScreen({ data }: { data: ContentData }) {
  const { openModal } = useAdmin();
  const needAlt = data.gallery.filter((g) => !g.alt.trim()).length;
  const tabs: TabDef[] = [
    'Photos',
    ['Gallery', needAlt ? `${needAlt} to fix` : ''],
    'Home page',
    'Other pages',
    'Rooms',
    'Venues',
    'FAQ',
    'Testimonials',
    'Banner',
    'Pages',
  ];
  const [t, setT] = useTab(tabs, 'Photos');
  const upload = useGalleryUpload();
  const actions: Action[] =
    t === 'Gallery'
      ? [
          {
            label: upload.busy ? 'Uploading…' : 'Upload photos',
            icon: 'upload',
            kind: 'primary',
            hint: 'JPG or PNG. Resized automatically.',
            disabled: upload.busy,
            on: upload.go,
          },
        ]
      : t === 'FAQ'
        ? [{ label: 'Add question', icon: 'plus', kind: 'primary', on: () => openModal(<FaqModal f={null} />) }]
        : t === 'Testimonials'
          ? [{ label: 'Add testimonial', icon: 'plus', kind: 'primary', on: () => openModal(<TestimonialModal x={null} />) }]
          : [];
  return (
    <>
      <PageHeader title="Content" sub="What guests see on the website." actions={actions} />
      <Tabs list={tabs} cur={t} set={setT} label="Content sections" />
      {t === 'Photos' && <Photos data={data} />}
      {t === 'Gallery' && <Gallery rows={data.gallery} />}
      {t === 'Home page' && <HomeForms data={data} />}
      {t === 'Other pages' && (
        <CopyForm
          data={data}
          title="Page introductions"
          note="The short line under each page title."
          fields={[
            ['pages.roomsIntro', 'Rooms page'],
            ['pages.galleryIntro', 'Gallery page'],
            ['pages.contactIntro', 'Contact page'],
            ['pages.rentIntro', 'Rentals page', true],
            ['pages.venueIntro', 'Venues page', true],
          ]}
        />
      )}
      {t === 'Rooms' && (
        <>
          <CopyForm
            data={data}
            title="Room descriptions"
            note="Shown on each room’s page. Prices are set in Rooms & rates, photos in the Photos tab."
            fields={[
              ['rooms.blurb.STD', 'Standard', true],
              ['rooms.blurb.EXE', 'Executive and Executive Plus', true],
              ['rooms.blurb.VIP', 'VIP', true],
              ['rooms.blurb.DBL', 'Double', true],
            ]}
          />
          <CopyForm
            data={data}
            title="House rules"
            note="Shown on every room page. One rule per line."
            fields={[['rooms.houseRules', 'Rules', true]]}
          />
        </>
      )}
      {t === 'Venues' && <VenueForms data={data} />}
      {t === 'FAQ' && <FaqTable rows={data.faqs} />}
      {t === 'Testimonials' && <TestimonialTable rows={data.testimonials} />}
      {t === 'Banner' && (
        <SettingsForm
          title="Announcement banner"
          note="Shows across the top of every public page."
          values={data.banner}
          fields={[
            { key: 'banner.enabled', label: 'Show the banner', kind: 'toggle' },
            { key: 'banner.text', label: 'Banner text', kind: 'text', wide: true, hint: 'One short sentence. Up to 140 characters.' },
          ]}
          save={(patch) => saveBannerAction(patch)}
        />
      )}
      {t === 'Pages' && <PagesTable />}
    </>
  );
}

/* ── copy forms ── */

type CopyFieldDef = [key: string, label: string, area?: boolean, hint?: string];

function CopyForm({ data, title, note, fields }: { data: ContentData; title: string; note: string; fields: CopyFieldDef[] }) {
  const ff: FormField[] = fields.map(([key, label, area, hint]) =>
    area
      ? { key, label, kind: 'area', placeholder: data.defaults[key], hint: hint ?? 'Leave it empty to use the original text.' }
      : { key, label, kind: 'text', wide: true, placeholder: data.defaults[key], hint },
  );
  const values = Object.fromEntries(fields.map(([k]) => [k, data.copy[k] ?? '']));
  return <SettingsForm title={title} note={note} fields={ff} values={values} save={(patch) => saveCopyAction(title, patch)} />;
}

function HomeForms({ data }: { data: ContentData }) {
  const tile = (i: number): FormField => ({
    key: `home.fac.${i}`,
    label: `Tile ${i + 1}`,
    kind: 'text',
    placeholder: data.defaults[`home.fac.${i}`],
  });
  const line = (i: number): FormField => ({
    key: `home.facLine.${i}`,
    label: data.copy[`home.fac.${i}`] || data.defaults[`home.fac.${i}`] || `Tile ${i + 1}`,
    kind: 'text',
    placeholder: data.defaults[`home.facLine.${i}`],
  });
  const vals = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, data.copy[k] ?? '']));
  const idx = [0, 1, 2, 3, 4, 5, 6, 7];
  const headings: [string, string][] = [
    ['home.roomsHeading', 'Rooms section'],
    ['home.overviewHeading', 'Overview section'],
    ['home.rentalsHeading', 'Rentals section'],
    ['home.rentalsSub', 'Rentals line'],
    ['home.spacesHeading', 'Venues section'],
    ['home.mapHeading', 'Map section'],
  ];
  return (
    <>
      <CopyForm
        data={data}
        title="Hero"
        note="The big headline and line under it at the top of the home page."
        fields={[
          ['home.heroTitle', 'Headline', false, 'Keep it short: 3 to 6 words reads best.'],
          ['home.heroSub', 'Line under the headline', true],
        ]}
      />
      <SettingsForm
        title="Section headings"
        note="Each heading sits above its section on the home page."
        fields={headings.map(([key, label]) => ({ key, label, kind: 'text', placeholder: data.defaults[key] }))}
        values={vals(headings.map(([k]) => k))}
        save={(p) => saveCopyAction('Section headings', p)}
      />
      <SettingsForm
        title="Overview items"
        note="The eight tiles in the overview section. Leave a box empty to keep the original name."
        fields={idx.map(tile)}
        values={vals(idx.map((i) => `home.fac.${i}`))}
        save={(p) => saveCopyAction('Overview items', p)}
      />
      <SettingsForm
        title="Overview lines"
        note="The line that shows when a guest points at each tile."
        fields={idx.map(line)}
        values={vals(idx.map((i) => `home.facLine.${i}`))}
        save={(p) => saveCopyAction('Overview lines', p)}
      />
    </>
  );
}

function VenueForms({ data }: { data: ContentData }) {
  return (
    <>
      {data.venues.map((v) => (
        <SettingsForm
          key={v.slug}
          title={v.name}
          note="Shown on the home page and the Venues page. Photos are in the Photos tab."
          fields={[
            { key: 'name', label: 'Name', kind: 'text' },
            { key: 'label', label: 'Short label', kind: 'text', placeholder: v.slug === 'compound' ? 'Outdoor · gated' : 'Indoor · AC' },
            { key: 'min', label: 'Fewest guests', kind: 'text', mono: true, hint: 'Leave empty if there’s no minimum.' },
            { key: 'max', label: 'Most guests', kind: 'text', mono: true },
            { key: 'description', label: 'Description', kind: 'area' },
          ]}
          values={{
            name: v.name,
            label: v.label,
            min: v.min == null ? '' : String(v.min),
            max: v.max == null ? '' : String(v.max),
            description: v.description,
          }}
          save={(p) => saveVenueAction(v.slug, p)}
        />
      ))}
    </>
  );
}

/* ── photo slots ── */

type SlotDef = [key: string, label: string, fit?: 'contain'];
const ROOM_NOTE = 'The main photo also shows on room cards and in checkout.';
const GROUPS: { title: string; note: string; slots: SlotDef[] }[] = [
  {
    title: 'Home page',
    note: 'Large photos look best at least 1600 px wide. We resize uploads for you.',
    slots: [
      ['hero', 'Hero (top of the home page)'],
      ['events', 'Venues banner'],
      ['testimonial', 'Testimonial'],
      ['footer', 'Footer (every page)'],
    ],
  },
  {
    title: 'Standard room',
    note: ROOM_NOTE,
    slots: [
      ['room.STD', 'Main photo'],
      ['room.STD.1', 'Bathroom'],
      ['room.STD.2', 'Hallway'],
    ],
  },
  {
    title: 'Executive room',
    note: 'Used for both Executive and Executive Plus. ' + ROOM_NOTE,
    slots: [
      ['room.EXE', 'Main photo'],
      ['room.EXE.1', 'Linen detail'],
      ['room.EXE.2', 'Bathroom'],
    ],
  },
  {
    title: 'VIP room',
    note: ROOM_NOTE,
    slots: [
      ['room.VIP', 'Main photo'],
      ['room.VIP.1', 'Bed and door'],
      ['room.VIP.2', 'Bathroom'],
      ['room.VIP.3', 'Rain shower'],
    ],
  },
  {
    title: 'Double room',
    note: ROOM_NOTE,
    slots: [
      ['room.DBL', 'Main photo'],
      ['room.DBL.1', 'Bathroom'],
    ],
  },
  {
    title: 'Overview section',
    note: 'The photo that appears when a guest points at each item on the home page. Item names are in Home page › Overview items.',
    slots: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [`fac.${i}`, ''] as SlotDef),
  },
  {
    title: 'Rentals cards',
    note: 'The three cards on the home page. Photos for each rental item are set in Rental inventory.',
    slots: [
      ['rental.canopies', 'Canopies', 'contain'],
      ['rental.tables', 'Tables', 'contain'],
      ['rental.chairs', 'Chairs', 'contain'],
    ],
  },
  {
    title: 'Venues page',
    note: '',
    slots: [
      ['venue.0', 'Event compound'],
      ['venue.1', 'Conference room'],
    ],
  },
  {
    title: 'Coming soon',
    note: 'Concept images for what isn’t open yet. They always carry a “Concept image” label on the site.',
    slots: [
      ['coming.breakfast', 'Breakfast'],
      ['coming.summer_hut', 'Summer Hut'],
    ],
  },
];

function Photos({ data }: { data: ContentData }) {
  const { toast, refresh } = useAdmin();
  const [busy, setBusy] = useState<string | null>(null);
  const facName = (i: number) => data.copy[`home.fac.${i}`] || data.defaults[`home.fac.${i}`] || `Item ${i + 1}`;
  const replace = async (key: string, label: string) => {
    const [file] = await pickFiles();
    if (!file) return;
    setBusy(key);
    try {
      const up = await uploadPhoto(file, () => signPhotoUpload('photos'));
      if ('error' in up) return toast('Photo not saved.', up.error);
      const r = await setSlotAction(key, up.id, label);
      toast(r.ok ? r.title : r.error, r.ok ? r.body : undefined);
      if (r.ok) refresh();
    } finally {
      setBusy(null);
    }
  };
  const reset = async (key: string, label: string) => {
    setBusy(key);
    const r = await setSlotAction(key, null, label);
    setBusy(null);
    toast(r.ok ? r.title : r.error, r.ok ? r.body : undefined);
    if (r.ok) refresh();
  };
  return (
    <>
      {GROUPS.map((g) => (
        <section key={g.title} style={{ ...panel, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{g.title}</h2>
            {g.note && <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--mute)' }}>{g.note}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
            {g.slots.map(([key, lab, fit]) => {
              const sl = data.photo[key];
              if (!sl) return null;
              const label = lab || facName(Number(key.split('.')[1]));
              const working = busy === key;
              return (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 10,
                    border: '1px solid var(--line)',
                    overflow: 'hidden',
                    background: 'var(--bg)',
                  }}
                >
                  <div style={{ position: 'relative', height: 150, overflow: 'hidden', background: 'var(--lane)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail straight from Cloudinary */}
                    <img
                      src={thumb(sl.id, 400)}
                      alt={label}
                      loading="lazy"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: fit ?? 'cover',
                        display: 'block',
                        opacity: working ? 0.4 : 1,
                      }}
                    />
                    {sl.custom && <span style={{ ...badge, background: 'var(--green-bg)', color: 'var(--green)' }}>Your photo</span>}
                    {working && (
                      <span
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12.5,
                        }}
                        role="status"
                      >
                        Uploading…
                      </span>
                    )}
                  </div>
                  <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>{label}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => void replace(key, label)}
                        style={{ ...smallBtn, flex: 1, gap: 6 }}
                      >
                        <Icon name="upload" size={14} />
                        Replace
                      </button>
                      {sl.custom && (
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void reset(key, label)}
                          aria-label="Go back to the original photo"
                          data-tip="Go back to the original photo"
                          style={{ ...smallBtn, width: 34 }}
                        >
                          <Icon name="undo" size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

const badge: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  padding: '3px 8px',
  borderRadius: 999,
  fontSize: 11.5,
  fontWeight: 500,
};
const smallBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 34,
  borderRadius: 8,
  border: '1px solid var(--line2)',
  background: 'var(--panel)',
  color: 'var(--ink)',
  fontSize: 12.5,
};

/* ── gallery ── */

function useGalleryUpload() {
  const { toast, refresh } = useAdmin();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const files = (await pickFiles(true)).slice(0, 30);
    if (!files.length) return;
    setBusy(true);
    const ids: string[] = [];
    let err = '';
    try {
      for (const f of files) {
        const up = await uploadPhoto(f, () => signPhotoUpload('gallery'), 1600);
        if ('error' in up) err = up.error;
        else ids.push(up.id);
      }
      if (!ids.length) return toast('No photos uploaded.', err);
      const r = await addGalleryAction(ids);
      toast(r.ok ? r.title : r.error, r.ok ? (err ? `${files.length - ids.length} didn’t upload: ${err}` : r.body) : undefined);
      if (r.ok) refresh();
    } finally {
      setBusy(false);
    }
  };
  return { busy, go: () => void go() };
}

function Gallery({ rows: saved }: { rows: GalleryRow[] }) {
  const [page, setPage] = useState(0);
  const [rows, move] = useOrdered(saved, 'gallery');
  const pages = Math.max(1, Math.ceil(rows.length / GAL_PAGE));
  const cur = Math.min(page, pages - 1);
  const live = rows.filter((g) => g.published).length;
  const shown = rows.slice(cur * GAL_PAGE, cur * GAL_PAGE + GAL_PAGE);
  return (
    <>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--mute)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
          {live} live on the site
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} />
          {rows.length - live} hidden until they have a description (alt text)
        </span>
      </div>
      {rows.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            border: '1px dashed var(--line2)',
            borderRadius: 12,
            textAlign: 'center',
            fontSize: 13.5,
            color: 'var(--mute)',
          }}
        >
          No gallery photos yet. Upload some to start.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }} data-stagger="">
          {shown.map((g, j) => (
            <GalleryCard
              key={`${g.id}:${g.alt}`}
              g={g}
              pos={cur * GAL_PAGE + j + 1}
              first={cur * GAL_PAGE + j === 0}
              last={cur * GAL_PAGE + j === rows.length - 1}
              onMove={(dir) => move(g.id, dir)}
            />
          ))}
        </div>
      )}
      {rows.length > GAL_PAGE && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>
            Showing {cur * GAL_PAGE + 1}–{Math.min(rows.length, cur * GAL_PAGE + GAL_PAGE)} of {rows.length}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              disabled={cur === 0}
              onClick={() => setPage(cur - 1)}
              style={{ ...smallBtn, height: 32, padding: '0 12px' }}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={cur >= pages - 1}
              onClick={() => setPage(cur + 1)}
              style={{ ...smallBtn, height: 32, padding: '0 12px' }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function GalleryCard({
  g,
  pos,
  first,
  last,
  onMove,
}: {
  g: GalleryRow;
  pos: number;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  const { can, toast, refresh, openModal } = useAdmin();
  const [alt, setAlt] = useState(g.alt);
  const ok = !!g.alt.trim();
  const save = async (patch: { alt?: string; category?: GalleryRow['category'] }) => {
    const nextAlt = (patch.alt ?? g.alt).trim();
    const r = await saveGalleryAction(g.id, { alt: nextAlt, category: patch.category ?? g.category, published: !!nextAlt });
    toast(r.ok ? r.title : r.error, r.ok ? r.body : undefined);
    if (r.ok) refresh();
    else setAlt(g.alt);
  };
  const bd = ok ? 'var(--line)' : 'var(--red)';
  return (
    <div
      style={{
        borderRadius: 12,
        background: 'var(--panel)',
        border: `1px solid ${bd}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ height: 140, background: 'var(--lane)', position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail straight from Cloudinary */}
        <img
          src={thumb(g.imageId, 440)}
          alt={g.alt}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <span
          style={{ ...badge, fontFamily: mono, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#00003A', color: '#F5F2EA' }}
        >
          #{pos}
        </span>
        {/* A dark frosted pill reads on any photo: white text on near-navy is well above 4.5:1. */}
        <span
          style={{
            ...badge,
            left: 'auto',
            right: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(0,0,32,0.72)',
            WebkitBackdropFilter: 'blur(8px) saturate(1.4)',
            backdropFilter: 'blur(8px) saturate(1.4)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: '#FFFFFF',
          }}
        >
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: ok ? '#5BC08A' : '#F4897E' }} />
          {ok ? 'Live' : 'Hidden'}
        </span>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Select
          variant="compact"
          ariaLabel="Category"
          value={g.category}
          options={CATS}
          onChange={(v) => void save({ category: v as GalleryRow['category'] })}
          width="100%"
        />
        <input
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          onBlur={() => alt.trim() !== g.alt && void save({ alt })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="Describe the photo, e.g. VIP bathroom"
          aria-label="Alt text"
          maxLength={200}
          style={{
            height: 40,
            borderRadius: 8,
            border: `1px solid ${ok ? 'var(--field)' : 'var(--red)'}`,
            background: 'var(--bg)',
            color: 'var(--ink)',
            fontSize: 13.5,
            padding: '0 10px',
          }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={first}
            aria-label="Move earlier"
            data-tip="Move earlier"
            style={{ ...smallBtn, height: 30, width: 34 }}
          >
            <Icon name="arrowleft" size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            aria-label="Move later"
            data-tip="Move later"
            style={{ ...smallBtn, height: 30, width: 34 }}
          >
            <Icon name="arrowright" size={14} />
          </button>
          {can('content.delete') && (
            <button
              type="button"
              aria-label="Delete photo"
              data-tip="Delete photo"
              onClick={() =>
                openModal(
                  <ConfirmModal
                    title="Delete this photo?"
                    sub="It comes off the gallery straight away."
                    confirm="Delete"
                    run={() => deleteGalleryAction(g.id)}
                  />,
                )
              }
              style={{ ...smallBtn, height: 30, width: 34, marginLeft: 'auto', color: 'var(--red)' }}
            >
              <Icon name="trash" size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── FAQ and testimonials ── */

/**
 * Up/down reordering that shows the new order at once. Saves run one after another in
 * click order; the list reloads from the server only when the last one is done, and
 * goes back to the saved order if one fails.
 */
function useOrdered<T extends { id: string }>(rows: T[], kind: 'faq' | 'testimonial' | 'gallery') {
  const { toast, refresh } = useAdmin();
  const [local, setLocal] = useState<{ src: T[]; ids: string[] } | null>(null);
  const queue = useRef(Promise.resolve());
  const inflight = useRef(0);
  // A fresh list from the server replaces the local order.
  const ids = local && local.src === rows ? local.ids : rows.map((r) => r.id);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is T => !!r);
  const move = (id: string, dir: -1 | 1) => {
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setLocal({ src: rows, ids: next });
    inflight.current += 1;
    queue.current = queue.current.then(async () => {
      const r = await moveAction(kind, id, dir);
      if (!r.ok) {
        toast(r.error);
        setLocal(null);
      }
      inflight.current -= 1;
      if (inflight.current === 0) refresh();
    });
  };
  return [ordered, move] as const;
}

function FaqTable({ rows: saved }: { rows: FaqRow[] }) {
  const { can, openModal } = useAdmin();
  const [rows, move] = useOrdered(saved, 'faq');
  return (
    <DataTable
      title="Questions"
      count={String(rows.length)}
      minW={760}
      empty={{ icon: 'message', text: 'No questions yet', sub: 'Add the questions guests ask most.' }}
      cols={[col('#'), col('QUESTION'), col('ANSWER'), col('STATUS')]}
      rows={rows.map((f, i) => ({
        key: f.id,
        on: () => openModal(<FaqModal f={f} />),
        cells: [
          c(i + 1, 'mono'),
          c(f.q, 'wrap'),
          c(f.a.length > 70 ? f.a.slice(0, 70) + '…' : f.a, 'mute'),
          c(f.published ? 'Live' : 'Hidden', 'chip', undefined, f.published ? 'green' : 'grey'),
        ],
        actions: [
          { label: 'Move up', icon: 'arrowup', iconOnly: true, disabled: i === 0, on: () => move(f.id, -1) },
          { label: 'Move down', icon: 'arrowdown', iconOnly: true, disabled: i === rows.length - 1, on: () => move(f.id, 1) },
          { label: 'Edit question', icon: 'edit', iconOnly: true, on: () => openModal(<FaqModal f={f} />) },
          ...(can('content.delete')
            ? [
                {
                  label: 'Delete question',
                  icon: 'trash' as const,
                  iconOnly: true,
                  kind: 'danger' as const,
                  on: () =>
                    openModal(<ConfirmModal title="Delete this question?" sub={f.q} confirm="Delete" run={() => deleteFaqAction(f.id)} />),
                },
              ]
            : []),
        ],
      }))}
    />
  );
}

function FaqModal({ f }: { f: FaqRow | null }) {
  const { run, busy, errors } = useAction();
  const [q, setQ] = useState(f?.q ?? '');
  const [a, setA] = useState(f?.a ?? '');
  const [live, setLive] = useState(f?.published ?? true);
  return (
    <ModalFrame
      title={f ? 'Edit question' : 'Add a question'}
      sub="Shown on the Contact page, in this order."
      confirm={f ? 'Save question' : 'Add question'}
      busy={busy}
      onConfirm={() => void run(() => saveFaqAction({ id: f?.id ?? null, q, a, published: live }))}
    >
      <FieldGrid>
        <TextField label="Question" value={q} onChange={setQ} err={errors.q} wide placeholder="e.g. Is there parking?" />
        <AreaField label="Answer" value={a} onChange={setA} err={errors.a} wide rows={5} />
      </FieldGrid>
      <LiveToggle live={live} set={setLive} label="Show on the website" />
    </ModalFrame>
  );
}

function LiveToggle({ live, set, label }: { live: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
      <Switch checked={live} onChange={() => set(!live)} label={label} size="sm" />
      <span>{label}</span>
    </div>
  );
}

function TestimonialTable({ rows: saved }: { rows: TestimonialRow[] }) {
  const { can, openModal, toast, refresh } = useAdmin();
  const [rows, move] = useOrdered(saved, 'testimonial');
  const live = async (x: TestimonialRow, v: boolean) => {
    const r = await testimonialLiveAction(x.id, v);
    toast(r.ok ? r.title : r.error, r.ok ? r.body : undefined);
    if (r.ok) refresh();
  };
  return (
    <DataTable
      title="Testimonials"
      count={`${rows.filter((x) => x.live).length} live`}
      minW={680}
      empty={{ icon: 'star', text: 'No testimonials yet', sub: 'The first live one shows on the home page.' }}
      cols={[col('QUOTE'), col('FROM'), col('STATUS')]}
      rows={rows.map((x, i) => ({
        key: x.id,
        on: () => openModal(<TestimonialModal x={x} />),
        cells: [c(`“${x.quote}”`, 'wrap'), c(x.from), c(x.live ? 'Live' : 'Draft', 'chip', undefined, x.live ? 'green' : 'grey')],
        actions: [
          x.live
            ? { label: 'Unpublish', icon: 'eye', iconOnly: true, hint: 'Hide from the website', on: () => void live(x, false) }
            : { label: 'Publish', icon: 'check', kind: 'primary', on: () => void live(x, true) },
          { label: 'Move up', icon: 'arrowup', iconOnly: true, disabled: i === 0, on: () => move(x.id, -1) },
          { label: 'Move down', icon: 'arrowdown', iconOnly: true, disabled: i === rows.length - 1, on: () => move(x.id, 1) },
          { label: 'Edit testimonial', icon: 'edit', iconOnly: true, on: () => openModal(<TestimonialModal x={x} />) },
          ...(can('content.delete')
            ? [
                {
                  label: 'Delete testimonial',
                  icon: 'trash' as const,
                  iconOnly: true,
                  kind: 'danger' as const,
                  on: () =>
                    openModal(
                      <ConfirmModal
                        title="Delete this testimonial?"
                        sub={x.from}
                        confirm="Delete"
                        run={() => deleteTestimonialAction(x.id)}
                      />,
                    ),
                },
              ]
            : []),
        ],
      }))}
    />
  );
}

function TestimonialModal({ x }: { x: TestimonialRow | null }) {
  const { run, busy, errors } = useAction();
  const [quote, setQuote] = useState(x?.quote ?? '');
  const [from, setFrom] = useState(x?.from ?? '');
  const [live, setLive] = useState(x?.live ?? false);
  return (
    <ModalFrame
      title={x ? 'Edit testimonial' : 'Add a testimonial'}
      sub="The first live testimonial shows on the home page. Only use words a guest actually wrote or said, with their permission."
      confirm={x ? 'Save testimonial' : 'Add testimonial'}
      busy={busy}
      onConfirm={() => void run(() => saveTestimonialAction({ id: x?.id ?? null, quote, from, live }))}
    >
      <FieldGrid>
        <AreaField
          label="Quote"
          value={quote}
          onChange={setQuote}
          err={errors.quote}
          wide
          rows={4}
          placeholder="What the guest said, without quote marks"
        />
        <TextField label="From" value={from} onChange={setFrom} err={errors.from} wide placeholder="e.g. John & Mary P. · Achimota" />
      </FieldGrid>
      <LiveToggle live={live} set={setLive} label="Publish on the website" />
    </ModalFrame>
  );
}

/* ── pages ── */

const PAGES: [string, string][] = [
  ['Home', '/'],
  ['Rooms', '/rooms'],
  ['Gallery', '/gallery'],
  ['Contact & FAQ', '/contact'],
  ['Book a room', '/book'],
  ['Rentals', '/rent'],
  ['Venues', '/venues'],
  ['Manage booking', '/manage'],
];

function PagesTable() {
  const open = (href: string) => window.open(href, '_blank', 'noopener');
  return (
    <DataTable
      title="Website pages"
      count={String(PAGES.length)}
      minW={560}
      cols={[col('PAGE'), col('ADDRESS'), col('STATUS')]}
      rows={PAGES.map(([name, href]) => ({
        key: href,
        on: () => open(href),
        cells: [c(name), c(href, 'mono'), c('Live', 'chip', undefined, 'green')],
        actions: [{ label: `Open ${name} in a new tab`, icon: 'external', iconOnly: true, on: () => open(href) }],
      }))}
    />
  );
}
