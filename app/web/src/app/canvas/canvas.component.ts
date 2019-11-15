import { Component, OnInit, ElementRef, Renderer2, Input, OnDestroy } from '@angular/core';
import { CanvasSpace, Pt, Group, CanvasForm, AnimateCallbackFn, Bound, Num } from 'pts';
import { MatrixConfig, BufferService } from '../buffer.service';
import { Subject, BehaviorSubject, Observable } from 'rxjs';
import { share, filter, switchMapTo, takeUntil, tap, withLatestFrom } from 'rxjs/operators';
import { SocketService } from '../socket.service';

@Component({
  selector: 'matrix-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.scss'],
})
export class CanvasComponent implements OnInit, OnDestroy {
  private readonly unsubscribe$ = new Subject<any>();
  private readonly ready$ = new BehaviorSubject(false);
  // private readonly pointer$ = new BehaviorSubject(new Pt(0, 0));
  // private readonly canvasRect$ = new BehaviorSubject(new ClientRect());
  private readonly ctx: CanvasRenderingContext2D;

  readonly form: CanvasForm;
  readonly space: CanvasSpace;
  readonly animate: Observable<{ t: number; dt: number }>;
  readonly pointer: Observable<Pt>;

  constructor(
    private readonly elRef: ElementRef,
    private readonly renderer2: Renderer2,
    private readonly canvas: HTMLCanvasElement,
    readonly bufferService: BufferService,
    readonly socketService: SocketService
  ) {
    (window as any).canvasComponent = this;
    this.renderer2.appendChild(this.elRef.nativeElement, this.canvas);
    this.ctx = this. canvas.getContext('2d')!;

    this.space = new CanvasSpace(this.canvas, () => this.ready$.next(true)).setup({
      bgcolor: '0xFF0000',
      resize: false,
      retina: false,
    });

    this.form = new CanvasForm(this.space);

    this.animate = new Observable(subscriber => {
      this.space.add((t, dt) => subscriber.next({ t: t!, dt: dt! }));
    });

    this.pointer = new Observable(subscriber => {
      let { left, top } = this.canvas.getBoundingClientRect();
      this.space.add({
        resize: () => {
          const rect = this.canvas.getBoundingClientRect();
          left = rect.left;
          top = rect.top;
          // { left, top } = rect;
          // { left, top } = this.canvas.getBoundingClientRect();
        },
        action: (t, x, y) => subscriber.next(new Pt(x - left, y - top)),
      });
    });

  }


  ngOnInit() {
    this.ready$.pipe(
      filter(ready => ready),
      switchMapTo(this.bufferService.config),
      tap(({ rows, cols }) => {
        console.log(`Setting canvas dimensions to ${rows}px by ${cols}px`);
        this.renderer2.setStyle(this.canvas, 'height', `${rows}px`);
        this.renderer2.setStyle(this.canvas, 'width', `${cols}px`);
        this.space.resize(new Bound(new Pt(0, 0), new Pt(cols, rows)));
      }),
      switchMapTo(this.animate),
      tap(() => this.socketService.pushCanvasCtx(this.ctx)),
      takeUntil(this.unsubscribe$)
    )
    .subscribe(config => {
      // console.log('lets play!');
    });

    this.animate.pipe(
      takeUntil(this.unsubscribe$),
      withLatestFrom(this.pointer, ({ t }, ptr) => {
        const radius = Num.cycle((t % 1000) / 1000) * 10;
        this.form.fill('#09f').point(ptr, radius, 'circle');
      })
    )
    .subscribe();

    this.space.bindMouse().play();
  }


  ngOnDestroy() {
    this.ready$.unsubscribe();
    this.space.removeAll();
    this.space.stop();
    this.unsubscribe$.next('unsubscribe!');
    this.unsubscribe$.unsubscribe();
  }
}
