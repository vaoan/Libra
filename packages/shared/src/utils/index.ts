// Shared utility functions

export { tid, TID_ATTR } from "./tid";
export type { TidOptionProps } from "./tid";

export { stripTrailingSlash } from "./url";
export { i18nField } from "./i18nField";
export { formatPrice } from "./formatPrice";
export { POPULAR_CURRENCIES } from "./currencies";
export { slugify } from "./slugify";
export { typeDetails } from "./typeDetails";
export { escapeLikePattern } from "./escapeLikePattern";
export {
  CATEGORY_THEMES,
  PRODUCT_CATEGORIES,
  getCategoryColor,
  getCategoryTheme,
} from "./categoryConstants";
export type { CategoryTheme } from "./categoryConstants";
export type {
  MerchDetails,
  DigitalDetails,
  ServiceDetails,
  TicketDetails,
} from "./typeDetails";
export { getCoverImageUrl } from "./getCoverImageUrl";
export {
  escapeXml,
  toCell,
  toNumberCell,
  buildWorkbook,
  downloadExcel,
} from "./spreadsheetml";
export type { WorkbookSheet } from "./spreadsheetml";
