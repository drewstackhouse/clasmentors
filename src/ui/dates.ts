/** "Sep 15, 3:12 PM" in the viewer's locale. */
export const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Local date as YYYY-MM-DD, for file names. */
export const today = () => new Date().toLocaleDateString('en-CA');
