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
var EuiIconTokenDimension = function EuiIconTokenDimension(_ref) {
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
    d: "M12 10.5a.5.5 0 0 0-1 0v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 0-1H12v-.5Z"
  }), ___EmotionJSX("path", {
    fillRule: "evenodd",
    d: "M3 12h3.078c.728 0 1.37-.127 1.924-.383a3.5 3.5 0 1 0 2.053-3.306c.005-.101.008-.205.008-.311 0-.833-.165-1.548-.493-2.145A3.309 3.309 0 0 0 8.18 4.48C7.58 4.16 6.87 4 6.047 4H3v8Zm6.787-2.321A2.5 2.5 0 0 0 11.5 14a2.5 2.5 0 1 0-1.713-4.321ZM6 10.156h-.828V5.844h.766c.416 0 .768.064 1.054.191.29.128.508.348.656.66.151.313.227.748.227 1.305 0 .557-.074.992-.223 1.305a1.29 1.29 0 0 1-.64.66c-.279.127-.616.191-1.012.191Z"
  }));
};
export var icon = EuiIconTokenDimension;