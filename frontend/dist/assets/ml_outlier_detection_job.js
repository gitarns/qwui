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
var EuiIconMlOutlierDetectionJob = function EuiIconMlOutlierDetectionJob(_ref) {
  var title = _ref.title,
    titleId = _ref.titleId,
    props = _objectWithoutProperties(_ref, _excluded);
  return ___EmotionJSX("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: 32,
    height: 32,
    viewBox: "0 0 32 32",
    "aria-labelledby": titleId
  }, props), title ? ___EmotionJSX("title", {
    id: titleId
  }, title) : null, ___EmotionJSX("path", {
    d: "M2 12v6h6v2H0v-8h2zm18 0v8h-8v-2h6v-6h2zM8 0v2H2v6H0V0h8zm12 0v8h-2V2h-6V0h8z"
  }), ___EmotionJSX("path", {
    d: "M16 24a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm12 0a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-12 1.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5zm12 0a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5zM28 12a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 1.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5zM10 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 1.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5z",
    className: "euiIcon__fillSecondary"
  }));
};
export var icon = EuiIconMlOutlierDetectionJob;