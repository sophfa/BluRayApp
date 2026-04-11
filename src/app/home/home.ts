import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class HomeComponent {
  public constructor(private router: Router) {}

  public go(path: string) {
    this.router.navigate([path]);
  }
}
