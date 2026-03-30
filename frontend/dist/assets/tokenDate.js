var _excluded = ["title", "titleId"];
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function _objectWithoutProperties(e, t) { if (null == e) return {}; var o, r, i = _objectWithoutPropertiesLoose(e, t); if (Object.getOwnPropertySymbols) { var n = Object.getOwnPropertySymbols(e); for (r = 0; r < n.length; r++) o = n[r], t.indexOf(o) >= 0 || {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]); } return i; }
function _objectWithoutPropertiesLoose(r, e) { if (null == r) return {}; var t = {}; for (var n in r) if ({}.hasOwnProperty.call(r, n)) { if (e.indexOf(n) >= 0) continue; t[n] = r[n]; } return t; }
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

// THIS IS A GENERATED FILE. DO NOT MODIFY MANUALLY. @see scripts/compile-icons.js

import * as React from 'react';
import { jsx as ___EmotionJSX } from "@emotion/react";
var EuiIconTokenDate = function EuiIconTokenDate(_ref) {
  var title = _ref.title,
    titleId = _ref.titleId,
    props = _objectWithoutProperties(_ref, _excluded);
  return ___EmotionJSX("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    "aria-labelledby": titleId
  }, props), title ? ___EmotionJSX("title", {
    id: titleId
  }, title) : null, ___EmotionJSX("path", {
    fillRule: "evenodd",
    d: "M13 11.567C13 12.36 12.36 13 11.567 13H4.433C3.64 13 3 12.36 3 11.567V4.433C3 3.64 3.64 3 4.433 3H6v-.495a.51.51 0 0 1 .412-.497L6.5 2c.276 0 .5.214.5.505V3h2v-.495a.51.51 0 0 1 .412-.497L9.5 2c.276 0 .5.214.5.505V3h1.567C12.36 3 13 3.64 13 4.433v7.134ZM4 6v5.33c0 .37.3.67.67.67h6.66c.37 0 .67-.3.67-.67V6H4Zm1.5 4c.245 0 .45.183.492.412L6 10.5c0 .245-.183.45-.412.492L5.5 11a.505.505 0 0 1-.5-.5c0-.245.183-.45.412-.492L5.5 10ZM8 10c.245 0 .45.183.492.412l.008.088c0 .245-.183.45-.412.492L8 11a.505.505 0 0 1-.5-.5c0-.245.183-.45.412-.492L8 10Zm2.5 0c.245 0 .45.183.492.412L11 10.5c0 .245-.183.45-.412.492L10.5 11a.505.505 0 0 1-.5-.5c0-.245.183-.45.412-.492L10.5 10Zm-5-1.5c.245 0 .45.183.492.412L6 9c0 .245-.183.45-.412.492L5.5 9.5A.505.505 0 0 1 5 9c0-.245.183-.45.412-.492L5.5 8.5Zm2.5 0c.245 0 .45.183.492.412L8.5 9c0 .245-.183.45-.412.492L8 9.5a.505.505 0 0 1-.5-.5c0-.245.183-.45.412-.492L8 8.5Zm2.5 0c.245 0 .45.183.492.412L11 9c0 .245-.183.45-.412.492L10.5 9.5A.505.505 0 0 1 10 9c0-.245.183-.45.412-.492L10.5 8.5ZM5.5 7c.245 0 .45.183.492.412L6 7.5c0 .245-.183.45-.412.492L5.5 8a.505.505 0 0 1-.5-.5c0-.245.183-.45.412-.492L5.5 7ZM8 7c.245 0 .45.183.492.412L8.5 7.5c0 .245-.183.45-.412.492L8 8a.505.505 0 0 1-.5-.5c0-.245.183-.45.412-.492L8 7Zm2.5 0c.245 0 .45.183.492.412L11 7.5c0 .245-.183.45-.412.492L10.5 8a.505.505 0 0 1-.5-.5c0-.245.183-.45.412-.492L10.5 7ZM4 5h8v-.33c0-.37-.3-.67-.67-.67H4.67C4.3 4 4 4.3 4 4.67V5Z"
  }));
};
export var icon = EuiIconTokenDate;