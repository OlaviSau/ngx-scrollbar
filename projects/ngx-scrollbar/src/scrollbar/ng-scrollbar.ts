import {
  Component,
  Inject,
  Input,
  ViewChild,
  ContentChild,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  PLATFORM_ID
} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {CdkScrollable, CdkVirtualScrollViewport} from '@angular/cdk/scrolling';
import {BreakpointObserver, Breakpoints, BreakpointState} from '@angular/cdk/layout';
import {fromEvent, Observable, Subject} from 'rxjs';
import {takeUntil, tap, throttleTime} from 'rxjs/operators';
import {ScrollToOptions, SmoothScroll, SmoothScrollEaseFunc} from '../smooth-scroll/smooth-scroll';
import {NgScrollbarView} from './ng-scrollbar-view';

// Native scrollbar size is 17px on all browsers,
// This value will be used to push the native scrollbar out of the scroll view to hide them
// An extra 1px is added to hide them properly on Edge browser
const NATIVE_SCROLLBAR_SIZE = '18px';

@Component({
  selector: 'ng-scrollbar',
  templateUrl: 'ng-scrollbar.html',
  styleUrls: ['ng-scrollbar.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.customView]': '!!customViewPort',
    '[attr.trackX]': 'trackX',
    '[attr.trackY]': 'trackY',
    '[attr.compact]': 'compact',
    '[attr.autoHide]': 'shown === "hover"'
  }
})
export class NgScrollbar implements AfterViewInit, OnDestroy {

  /** Horizontal custom scrollbar */
  @Input() trackX = false;
  /** Vertical custom Scrollbar */
  @Input() trackY = true;
  /** Scrollbar visibility */
  @Input() shown: 'hover' | 'always' | 'native' = 'native';
  /** Auto update scrollbars on content changes (Mutation Observer) */
  @Input() autoUpdate = true;
  /** Viewport class */
  @Input() viewClass: string;
  /** Scrollbars class */
  @Input() barClass: string;
  /** Scrollbars thumbnails class */
  @Input() thumbClass: string;
  /** The smooth scroll duration when a scrollbar is clicked */
  @Input() scrollToDuration = 300;
  /** Compact mode */
  @Input() compact: boolean;
  /** Invert vertical scrollbar position, if set the scrollbar will be on the right */
  @Input() invertY: boolean;
  /** Invert horizontal scrollbar position, if set the scrollbar will go the top */
  @Input() invertX: boolean;
  /** Disable custom scrollbars on specific breakpoints */
  @Input() disableOnBreakpoints = [
    Breakpoints.HandsetLandscape,
    Breakpoints.HandsetPortrait
  ];

  /** Disable custom scrollbars and switch back to native scrollbars */
  disabled = false;
  @Input('disabled') set setDisabled(disable: boolean) {
    disable ? this.disable() : this.enable();
  }

  /** Scrollbars ElementRef */
  @ViewChild('y', {read: ElementRef, static: true}) verticalScrollbar: ElementRef;
  @ViewChild('x', {read: ElementRef, static: true}) horizontalScrollbar: ElementRef;

  /** Default viewport and smoothScroll references */
  @ViewChild(CdkScrollable, {static: true}) scrollViewport: CdkScrollable;
  @ViewChild(SmoothScroll, {static: true}) viewSmoothScroll: SmoothScroll;

  /** Virtual viewport and smoothScroll references */
  @ContentChild(NgScrollbarView, {static: true}) customViewPort: NgScrollbarView;

  /** Viewport Element */
  get view(): HTMLElement {
    return this.customViewPort
      ? this.customViewPort.virtualScrollViewport.getElementRef().nativeElement
      : this.scrollViewport.getElementRef().nativeElement;
  }

  get scrollable(): CdkScrollable | CdkVirtualScrollViewport {
    return this.customViewPort
      ? this.customViewPort.virtualScrollViewport
      : this.scrollViewport;
  }

  get smoothScroll(): SmoothScroll {
    return this.customViewPort
      ? this.customViewPort.smoothScroll
      : this.viewSmoothScroll;
  }

  get hideNativeScrollbars(): any {
    const size = this.disabled ? '100%' : `calc(100% + ${NATIVE_SCROLLBAR_SIZE})`;
    return {
      width: this.trackY ? size : '100%',
      height: this.trackX ? size : '100%'
    };
  }

  /** Unsubscribe component observables on destroy */
  private _unsubscribe$ = new Subject();
  /** Observe content changes */
  private _observer: MutationObserver;

  /** Steam that emits when scrollbar thumbnail needs to update (for internal uses) */
  private _updateObserver = new Subject();
  updateObserver = this._updateObserver.asObservable();

  constructor(private _changeDetectorRef: ChangeDetectorRef,
              private _breakpointObserver: BreakpointObserver,
              @Inject(PLATFORM_ID) private _platform: Object) {
  }

  showScrollbarY() {
    return this.shown === 'always' || this.view.scrollHeight > this.view.clientHeight;
  }

  showScrollbarX() {
    return this.shown === 'always' || this.view.scrollWidth > this.view.clientWidth;
  }

  ngAfterViewInit() {
    // Avoid 'expression has changed after it was checked' error when 'disableOnBreakpoints' is set to false
    Promise.resolve().then(() => {
      if (!this.disabled) {
        if (this.disableOnBreakpoints) {
          // Enable/Disable custom scrollbar on breakpoints (Used to disable scrollbars on mobile phones)
          this._breakpointObserver.observe(this.disableOnBreakpoints).pipe(
            tap((result: BreakpointState) => result.matches ? this.disable() : this.enable()),
            takeUntil(this._unsubscribe$)
          ).subscribe();
        } else {
          this.enable();
        }
      }

      // Update state on content changes
      this.updateObserver.pipe(
        throttleTime(200),
        tap(() => this._changeDetectorRef.markForCheck()),
        takeUntil(this._unsubscribe$)
      ).subscribe();


      if (isPlatformBrowser(this._platform)) {
        // Update on window resize
        fromEvent(window, 'resize').pipe(
          throttleTime(200),
          tap(() => this.update()),
          takeUntil(this._unsubscribe$)
        ).subscribe();
      }
    });
  }

  ngOnDestroy() {
    this._unsubscribe$.next();
    this._unsubscribe$.complete();
    if (this._observer) {
      this._observer.disconnect();
    }
  }

  /**
   * Update scrollbar thumbnail position
   */
  update() {
    if (!this.disabled) {
      this._updateObserver.next();
    }
  }

  /**
   * Enable custom scrollbar
   */
  enable() {
    if (this.view) {
      this.disabled = false;
      // Update view
      this._changeDetectorRef.markForCheck();

      if (!this.customViewPort && this.autoUpdate && isPlatformBrowser(this._platform)) {
        // Observe content changes
        this._observer = new MutationObserver(() => this.update());
        this._observer.observe(this.view, {subtree: true, childList: true, characterData: true});
      }
    }
  }

  /**
   * Disable custom scrollbar
   */
  disable() {
    this.disabled = true;
    if (this._observer) {
      this._observer.disconnect();
    }
  }

  scrollTo(options: ScrollToOptions): Observable<void> {
    return this.smoothScroll.scrollTo(options);
  }

  scrollToElement(selector: string, offset = 0, duration?: number, easeFunc?: SmoothScrollEaseFunc): Observable<void> {
    return this.smoothScroll.scrollToElement(selector, offset, duration, easeFunc);
  }

  scrollXTo(to: number, duration?: number, easeFunc?: SmoothScrollEaseFunc): Observable<void> {
    return this.smoothScroll.scrollXTo(to, duration, easeFunc);
  }

  scrollYTo(to: number, duration?: number, easeFunc?: SmoothScrollEaseFunc): Observable<void> {
    return this.smoothScroll.scrollYTo(to, duration, easeFunc);
  }

  scrollToTop(duration?: number, easeFunc?: SmoothScrollEaseFunc): Observable<void> {
    return this.smoothScroll.scrollToTop(duration, easeFunc);
  }

  scrollToBottom(duration?: number, easeFunc?: SmoothScrollEaseFunc): Observable<void> {
    return this.smoothScroll.scrollToBottom(duration, easeFunc);
  }

  scrollToRight(duration?: number, easeFunc?: SmoothScrollEaseFunc): Observable<void> {
    return this.smoothScroll.scrollToRight(duration, easeFunc);
  }

  scrollToLeft(duration?: number, easeFunc?: SmoothScrollEaseFunc): Observable<void> {
    return this.smoothScroll.scrollToLeft(duration, easeFunc);
  }
}
