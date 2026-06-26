/**
 * AliasDictionary.ts
 * Central alias dictionary — add new providers here only.
 * Never modify the parser engine for new formats.
 */

export type CanonicalField =
  | 'net_total'
  | 'gross_total'
  | 'taxes'
  | 'channel_costs'
  | 'other_costs'
  | 'currency'
  | 'currency_net_total'
  | 'artist'
  | 'track'
  | 'album'
  | 'upc'
  | 'isrc'
  | 'platform'
  | 'country'
  | 'quantity'
  | 'sale_period'

/**
 * Each canonical field maps to a list of known aliases.
 * Aliases are matched after full normalization (lowercase, no spaces/accents/symbols).
 * Order matters: first exact match wins.
 */
export const ALIAS_DICTIONARY: Record<CanonicalField, string[]> = {
  net_total: [
    // Exact canonical
    'nettotal', 'net_total',
    // Ditto
    'nettotal',
    // DistroKid
    'earningsusd', 'youearned', 'yourearnings',
    'earnings',
    // TuneCore / CD Baby
    'netrevenue', 'netearnings', 'netamount', 'netincome',
    'netpayout', 'paidusd', 'paid',
    // CD Baby — net_payable
    'netpayable',
    // Believe / FUGA
    'royaltyamountusd', 'royaltyamount', 'totalroyalty', 'netroyalty',
    'royaltyusd', 'royalty',
    // YouTube Content ID
    'partnerrevenue',
    // Spotify / generic
    'revenue',
    // SoundOn
    'finalroyalty',
    // Global Sound Stars / label reports
    'collaboratorshare',
    // Generic
    'settlementamount', 'totalearnings', 'amountusd', 'amount',
    'payment', 'income', 'payout',
    'artistroyalty',
  ],
  gross_total: [
    'grosstotal', 'gross_total',
    'grossrevenue', 'grossearnings', 'grossamount', 'grossincome',
    // NOTE: 'currencygrosstotal' removed — matches Ditto's gross_total_client_currency incorrectly
    'gross',
  ],
  taxes: [
    'taxes', 'tax', 'taxamount', 'witholdingtax', 'withholdingtax',
    'vat', 'gst',
  ],
  channel_costs: [
    'channelcosts', 'channel_costs', 'channelcost',
    'distributioncost', 'distributionfee', 'channelcostsclientcurrency',
  ],
  other_costs: [
    'othercosts', 'other_costs', 'othercost',
    'othercostsclientcurrency',
    'deductions', 'deduction', 'fees', 'fee',
  ],
  currency: [
    'currency', 'currencycode', 'cur', 'curr',
    'paymentcurrency', 'reportingcurrency',
  ],
  currency_net_total: [
    'nettotalclientcurrency',
    'currencynettotal',
    'currencynet',
    'localnet', 'localamount', 'localcurrencyamount',
  ],
  artist: [
    'artistname', 'artist_name', 'trackartists',
    'artist', 'performer', 'act',
    'recordingartist', 'mainartist', 'primaryartist', 'labelartist',
  ],
  track: [
    'tracktitle', 'track_title', 'songtitle', 'song_title',
    'trackname', 'songname', 'recordingtitle', 'assettitle',
    'contenttitle', 'worktitle',
    'song', 'track',
  ],
  album: [
    'albumtitle', 'album_title', 'albumname', 'album_name',
    'releasetitle', 'releasename', 'producttitle',
    'album', 'release',
  ],
  upc: [
    'upc', 'displayupc', 'productupc', 'barcode',
  ],
  isrc: [
    'isrc', 'trackisrc', 'recordingisrc',
  ],
  platform: [
    'storename', 'store_name', 'dspname', 'platformname',
    'musicservice', 'streamingservice', 'retailer', 'outlet',
    // Ditto uses "channel"
    'channel',
    // YouTube Content ID
    'contenttype',
    'store', 'platform', 'dsp', 'service',
    'distributor', 'provider', 'source', 'vendor',
  ],
  country: [
    'countryofsale', 'salesregion', 'salescountry',
    'territory', 'region', 'market', 'salecountry',
    'geo', 'location',
    'country',
  ],
  quantity: [
    'unitsofsold', 'unitssold',
    'numberofstreams', 'streamcount', 'totalstreams', 'totalplays',
    'streamsdownloads', 'netunits', 'totalquantity',
    'downloads',
    // Ditto uses "units" (NOT unit_price)
    'units',
    // YouTube Content ID
    'partnerstreams',
    'quantity', 'streams', 'plays',
  ],
  sale_period: [
    'reportingdate', 'reportingmonth', 'reportmonth',
    'salemonth', 'salesperiod', 'saleperiod', 'sale_period',
    'reportingperiod', 'incomeperiod', 'billingperiod',
    'settlementdate', 'paymentdate', 'transactiondate', 'reportdate',
    // Ditto: use start_date
    'startdate', 'start_date',
    'period', 'month', 'date',
  ],
}

/**
 * Columns that should NEVER be mapped as net_total or gross_total.
 * Matched after normalization.
 * NOTE: 'isrc', 'upc', 'barcode' intentionally removed — they are valid target fields.
 * Ditto client-currency columns are excluded from primary money field mapping.
 */
export const EXCLUDED_COLUMNS = new Set([
  'unitprice', 'price', 'rate',
  'royaltybasis',
  'taxrate',
  'sharepercentage', 'percentage',
  'currencyrate', 'exchangerate',
  'transactiontype',
  'projectcode', 'productcode', 'labelcode',
  'tenantid',
  'id',
  // Ditto client-currency variants — must never override the primary USD columns
  'grosstotalclientcurrency',
  'channelcostsclientcurrency',
  'othercostsclientcurrency',
  // NOTE: nettotalclientcurrency is allowed as currency_net_total but excluded from net_total match
])
