'use client';
// Downloads from the admin: exports (as Excel or CSV, the person picks) and
// invoices. Files arrive without leaving the screen.
import { useState } from 'react';
import { useAdmin } from './context';
import { FieldGrid, ModalFrame, Note, SelectField } from './modal';
import type { Action } from './ui';

/** Starts a file download without leaving the screen. */
export function download(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const withFormat = (href: string, format: string) => `${href}${href.includes('?') ? '&' : '?'}format=${format}`;

function ExportModal({ what, href }: { what: string; href: string }) {
  const { closeModal, toast } = useAdmin();
  const [format, setFormat] = useState('xlsx');
  return (
    <ModalFrame
      title={`Download ${what}`}
      sub="As a spreadsheet for Excel or Google Sheets, or as plain CSV."
      confirm="Download"
      onConfirm={() => {
        download(withFormat(href, format));
        closeModal();
        toast('Download started.');
      }}
    >
      <FieldGrid>
        <SelectField
          label="Format"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'xlsx', label: 'Excel spreadsheet (.xlsx)' },
            { value: 'csv', label: 'CSV (.csv)' },
          ]}
          wide
        />
      </FieldGrid>
      <Note>The download is noted in the audit log.</Note>
    </ModalFrame>
  );
}

/** The header "Export" button: opens the format chooser for `href`. */
export function useExportAction() {
  const { openModal } = useAdmin();
  return (what: string, href: string): Action => ({
    label: 'Export',
    icon: 'download',
    hint: `Download ${what} as a spreadsheet`,
    on: () => openModal(<ExportModal what={what} href={href} />),
  });
}

/** "Receipt" or "Invoice" for a booking or rental order, as a PDF. */
export function invoiceAction(kind: 'bookings' | 'rentals', ref: string, paid: boolean): Action {
  return {
    label: paid ? 'Receipt' : 'Invoice',
    icon: 'printer',
    hint: `Download the ${paid ? 'receipt' : 'invoice'} as a PDF`,
    on: () => download(`/admin/${kind}/${encodeURIComponent(ref)}/invoice`),
  };
}
