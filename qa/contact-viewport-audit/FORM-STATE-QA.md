# Contact Form-State QA

Contact portrait certification must validate the success and failure UI states without consuming real EmailJS requests.

## Mocked submission policy

`run-contact-form-state-qa.cjs` intercepts EmailJS in the browser and returns controlled success/failure responses. No real EmailJS submission is expected to leave the browser during QA.

For every selected viewport, verify:

- success message appears with the approved text
- success message remains contained inside Contact
- successful submission resets the fields
- Send returns to its enabled `Send` state
- failure message appears with the approved text
- failure message remains contained inside Contact
- failed submission preserves the entered field values
- no success/error state introduces horizontal overflow
- no success/error state pushes the form outside the Contact section

For the first viewport in each pass, also verify:

- success auto-hides after the configured six-second interval
- failure remains visible instead of auto-hiding

`run-contact-portrait-pass.cjs` runs the normal geometry/motion QA and the mocked form-state QA together so these states are part of phone-portrait and foldable-portrait certification.

## iPhone / WebKit focus zoom

The accepted portrait control text is currently below 16px in some geometries. iOS Safari may automatically zoom when a focused form control has a computed font size below 16px.

The form-state runner records input/textarea font sizes and a focus/visualViewport probe. On WebKit portrait runs it emits `IOS_SAFARI_FOCUS_ZOOM_RISK_LT_16PX` whenever the focused control font is below 16px.

Desktop Playwright WebKit is not authoritative for iOS Safari browser-UI auto-zoom. A clean Playwright scale probe does not waive the real-device requirement. Final iPhone certification must explicitly focus Name, Email, and Message on a real iPhone/Safari session and confirm that the page does not unexpectedly zoom or disturb the accepted Contact geometry. If real iPhone Safari zooms, the production fix should raise the affected iOS-focused control font to at least 16px and then re-run the Contact portrait closure.
