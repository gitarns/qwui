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
var EuiIconTokenAlias = function EuiIconTokenAlias(_ref) {
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
    d: "M9.075 6.953a.5.5 0 1 1-.707.707 1.5 1.5 0 0 0-2.122 0L4.125 9.782a1.5 1.5 0 1 0 2.121 2.121l1.145-1.144a.5.5 0 0 1 .707.707L6.953 12.61a2.5 2.5 0 1 1-3.535-3.535l2.121-2.122a2.5 2.5 0 0 1 3.536 0Zm3.535-3.535a2.5 2.5 0 0 1 0 3.535L10.49 9.075a2.5 2.5 0 0 1-3.536 0 .5.5 0 1 1 .707-.708 1.5 1.5 0 0 0 2.122 0l2.121-2.12a1.5 1.5 0 1 0-2.121-2.122L8.637 5.269a.5.5 0 1 1-.707-.707l1.145-1.144a2.5 2.5 0 0 1 3.535 0Z"
  }));
};
export var icon = EuiIconTokenAlias;