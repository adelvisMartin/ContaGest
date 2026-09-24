# 57/75 · Vertical experience profile

## Objective

Make the authenticated workspace open in the business context the user actually licensed without turning UX preferences into an authorization source.

## Authority

The experience profile is derived from the validated access manifest:

- business mode metadata;
- canonical landing route;
- a small set of core quick routes.

Authorization remains independent and fail-closed through role, license and subscription checks. A quick route or landing is still rejected if the active user cannot access it.

## Session contract

The backend includes `experienceProfile` in authenticated sessions. The frontend persists that profile and uses it for:

- post-login landing;
- denied-route fallback;
- shell label and primary workspace action;
- quick navigation.

## Vertical behavior

Clinical and fitness modes land in their own workspace:

- salud → salud;
- veterinaria → veterinaria;
- psicologia → psicologia;
- odontologia → odontologia;
- gimnasio → gimnasio;
- nutricion → nutricion.

Unknown/legacy business sectors fall back to the administrative experience profile only as presentation. This does not widen permissions because every navigation target is checked again by `AccessControlService`.

## Regression

`tests/vertical_experience_profile_57_75.test.mjs` locks manifest-derived landing/quick routes, auth-session propagation and frontend consumption.
