import { RunService } from "@rbxts/services";
import { ConnectionManager, IConnectionManager, ISignal, Signal } from "@rbxts/signals-tooling";
import t from "@rbxts/t";
import { Dumpster } from "@rbxts/dumpster";
import { ITimer } from "../Interfaces/ITimer";
import { TimerStopCause, TimerState } from "../Data/Enums";

function assertValidLength(lengthInSeconds: number) {
	if (!t.numberPositive(lengthInSeconds)) {
		throw "Timer length must be greater than 0";
	}
}

export class Timer implements ITimer {
	public readonly completed: ISignal<() => void>;
	public readonly lengthChanged: ISignal<(newLengthInSeconds: number, oldLengthInSeconds: number) => void>;
	public readonly paused: ISignal<() => void>;
	public readonly resumed: ISignal<() => void>;
	public readonly started: ISignal<() => void>;
	public readonly stopped: ISignal<(stopCause: TimerStopCause) => void>;
	public readonly secondReached: ISignal<(seconds: number) => void>;

	private readonly runningEventsConnectionManager: IConnectionManager;

	private lastEmittedSeconds: number;
	private lengthInSeconds: number;
	private state: TimerState;
	private timeLeftInSeconds: number;
	private dumpster: Dumpster;

	/**
	 * Instantiates a new InterruptableTimer
	 * @param lengthInSeconds The length of the timer in seconds
	 * @throws Throws if lengthInSeconds <= 0
	 */
	public constructor(lengthInSeconds: number) {
		assertValidLength(lengthInSeconds);

		this.completed = new Signal();
		this.lengthChanged = new Signal<(newLengthInSeconds: number, oldLengthInSeconds: number) => void>();
		this.paused = new Signal();
		this.resumed = new Signal();
		this.started = new Signal();
		this.stopped = new Signal<(stopCause: TimerStopCause) => void>();
		this.secondReached = new Signal<(seconds: number) => void>();

		this.lastEmittedSeconds = -1;
		this.lengthInSeconds = lengthInSeconds;
		this.runningEventsConnectionManager = this._initializeRunningEventsConnectionManager();
		this.state = TimerState.NotRunning;
		this.timeLeftInSeconds = 0;

		this.dumpster = new Dumpster();
		this.dumpster.dump(this.completed, () => this.completed.disconnectAll());
		this.dumpster.dump(this.lengthChanged, () => this.lengthChanged.disconnectAll());
		this.dumpster.dump(this.paused, () => this.paused.disconnectAll());
		this.dumpster.dump(this.resumed, () => this.resumed.disconnectAll());
		this.dumpster.dump(this.started, () => this.started.disconnectAll());
		this.dumpster.dump(this.stopped, () => this.stopped.disconnectAll());
		this.dumpster.dump(this.secondReached, () => this.secondReached.disconnectAll());
		this.dumpster.dump(this.runningEventsConnectionManager, () =>
			this.runningEventsConnectionManager.disconnectAll(),
		);
	}

	public destroy() {
		if (this.state !== TimerState.NotRunning) {
			this.stop();
		}
		this.dumpster.burn();
	}

	public getCurrentEndTimeUtc(): number {
		if (this.state !== TimerState.Running) {
			throw "Cannot estimate end time when not running";
		}

		return os.time() + this.timeLeftInSeconds;
	}

	public getState(): TimerState {
		return this.state;
	}

	public getTimeLeft(): number {
		return this.timeLeftInSeconds;
	}

	public pause(): void {
		if (this.state === TimerState.Running) {
			throw "Cannot pause a timer that is not running";
		}

		this.state = TimerState.Paused;
		this.runningEventsConnectionManager.disconnectAll();

		this.paused.fire();
	}

	public resume(): void {
		if (this.state !== TimerState.Paused) {
			throw "Cannot resume a timer that is not paused";
		}

		this.state = TimerState.Running;
		this.runningEventsConnectionManager.connectAll();

		this.resumed.fire();
	}

	public runSync(): TimerStopCause {
		this.start();

		const [stopCause] = this.stopped.Wait();

		return stopCause;
	}

	public setLength(lengthInSeconds: number): void {
		assertValidLength(lengthInSeconds);

		if (this.lengthInSeconds === lengthInSeconds) {
			return;
		}

		const oldLengthInSeconds = this.lengthInSeconds;
		this.lengthInSeconds = lengthInSeconds;

		this.lengthChanged.fire(lengthInSeconds, oldLengthInSeconds);
	}

	public start(): void {
		if (this.state === TimerState.Running) {
			throw "Cannot start a timer that is already running";
		}

		this.timeLeftInSeconds = this.lengthInSeconds;

		this.state = TimerState.Running;
		this.runningEventsConnectionManager.connectAll();

		this.started.fire();
	}

	public stop(): void {
		if (this.state === TimerState.NotRunning) {
			throw "Cannot stop a timer that is not running or paused";
		}

		this._cleanUp(TimerStopCause.Stopped);
	}

	private _cleanUp(timerStopCause: TimerStopCause) {
		this.lastEmittedSeconds = -1;
		this.state = TimerState.NotRunning;
		this.timeLeftInSeconds = 0;

		this.runningEventsConnectionManager.disconnectAll();

		this.stopped.fire(timerStopCause);
	}

	private _initializeRunningEventsConnectionManager(): IConnectionManager {
		const runningEventsConnectionManager = new ConnectionManager();

		runningEventsConnectionManager.addConnectionData(RunService.Heartbeat, (timeStep: number) => {
			if (this.state !== TimerState.Running) {
				return;
			}

			this.timeLeftInSeconds -= timeStep;

			if (this.timeLeftInSeconds <= 0) {
				this._cleanUp(TimerStopCause.Completed);
				this.completed.fire();
				return;
			}

			const timeLeftCeil = math.ceil(this.timeLeftInSeconds);
			if (timeLeftCeil !== this.lastEmittedSeconds) {
				this.lastEmittedSeconds = timeLeftCeil;
				this.secondReached.fire(timeLeftCeil);
			}
		});

		return runningEventsConnectionManager;
	}
}
