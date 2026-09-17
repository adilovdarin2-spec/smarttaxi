# SmartTaxi passenger authentication visual QA — 2026-09-10

## Result

The passenger authentication entry screen now belongs to the same premium
blue/white product language as the passenger map and driver experience. The
authentication flow and legal links were not changed.

## Confirmed issue

The first phone screen still used an older yellow/orange, photo-based hero. In
live QA it looked like a separate product beside the current blue/white map and
driver interfaces.

## Changes

- Replaced the baked photo hero with SmartTaxi's original blue route/car vector
  artwork and blue brand marks already owned by the project.
- Restored the visible brand lockup and service promise over a restrained map
  texture.
- Tightened the hero and primary action so the form is visible sooner on 360–390
  px screens.
- Enabled actions now use white text and arrow on the approved blue gradient;
  disabled state remains visually distinct.
- Added a source regression check that rejects a return to the removed photo
  background and verifies the premium hero contract.

## Live QA

- Rebuilt the local Docker web image and reloaded `/order` at mobile width.
- Checked empty and valid phone-number states.
- Confirmed heading, input, primary action, SMS explanation, role warning, and
  legal links remain readable without overlap.
- Confirmed the open-tab recovery screen survives an asset replacement and its
  reload action restores the authenticated driver screen without altering an
  order.

No third-party brand, copied vehicle photograph, production SMS, or production
account was used.
